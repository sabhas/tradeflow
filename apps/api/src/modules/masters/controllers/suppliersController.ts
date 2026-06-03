import type { Request } from 'express';
import { IsNull } from 'typeorm';
import type { z } from 'zod';
import { dataSource, Supplier } from '@tradeflow/db';
import { createSupplierSchema, updateSupplierSchema } from '@tradeflow/shared';
import { createSupplierPayableAccount } from '../../accounting/services/glAccountService';
import { getPagination } from '../../../shared/utils/pagination';
import { created, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';

type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

export function serializeSupplier(s: Supplier) {
  return {
    id: s.id,
    name: s.name,
    address: s.address,
    city: s.city,
    telephone: s.telephone,
    mobileNo: s.mobileNo,
    email: s.email,
    website: s.website,
    contact: s.contact,
    ntn: s.ntn,
    stn: s.stn,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    deletedAt: s.deletedAt,
  };
}

export async function listSuppliers(req: Request): Promise<ControllerResult> {
  const { limit, offset } = getPagination(req);
  const search = (req.query.search as string | undefined)?.trim();

  const qb = Supplier.createQueryBuilder('s').where('s.deleted_at IS NULL');
  if (search) {
    qb.andWhere('LOWER(s.name) LIKE :term', { term: `%${search.toLowerCase()}%` });
  }
  qb.orderBy('s.name', 'ASC').take(limit).skip(offset);

  const [rows, total] = await qb.getManyAndCount();
  return ok({ data: rows.map(serializeSupplier), meta: { total, limit, offset } });
}

type StatementRow =
  | { kind: 'invoice'; date: string; id: string; debit: string; credit: string; ref: string }
  | { kind: 'payment'; date: string; id: string; debit: string; credit: string; ref: string }
  | { kind: 'journal'; date: string; id: string; debit: string; credit: string; ref: string };

function normalizeDateText(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.slice(0, 10);
  return String(value).slice(0, 10);
}

export async function getSupplierStatement(req: Request): Promise<ControllerResult> {
  const { id } = req.params;
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const supplier = await Supplier.findOne({ where: { id, deletedAt: IsNull() } });
  if (!supplier) {
    throw new HttpError(404, { error: 'Not found' });
  }

  const op = await dataSource.query(
    `
    SELECT (
      (SELECT COALESCE(SUM(si.total::numeric), 0) FROM supplier_invoices si
       WHERE si.supplier_id = $1 AND si.status = 'posted'
         AND si.invoice_date < $2::date)
      -
      (SELECT COALESCE(SUM(spa.amount::numeric), 0)
       FROM supplier_payment_allocations spa
       INNER JOIN supplier_payments sp ON sp.id = spa.supplier_payment_id
       INNER JOIN supplier_invoices si ON si.id = spa.supplier_invoice_id
       WHERE si.supplier_id = $1 AND si.status = 'posted'
         AND sp.payment_date < $2::date)
    )::text AS opening
    `,
    [id, dateFrom]
  );
  const opening = op[0]?.opening ?? '0.0000';
  const opManual = await dataSource.query(
    `
    SELECT COALESCE(SUM(jl.debit::numeric - jl.credit::numeric), 0)::text AS opening
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.account_id = $1::uuid
      AND je.deleted_at IS NULL
      AND je.status = 'posted'
      AND je.entry_date < $2::date
      AND (je.source_type IS NULL OR je.source_type = 'journal_reversal')
    `,
    [supplier.payableAccountId, dateFrom]
  );
  const openingManual = opManual[0]?.opening ?? '0.0000';

  const invoices = await dataSource.query(
    `
    SELECT si.id, si.invoice_date AS date, si.total::text AS amount
    FROM supplier_invoices si
    WHERE si.supplier_id = $1 AND si.status = 'posted'
      AND si.invoice_date >= $2::date AND si.invoice_date <= $3::date
    ORDER BY si.invoice_date ASC, si.id ASC
    `,
    [id, dateFrom, dateTo]
  );

  const payments = await dataSource.query(
    `
    SELECT sp.id, sp.payment_date AS date, sp.amount::text AS amount, sp.reference AS reference
    FROM supplier_payments sp
    WHERE sp.supplier_id = $1
      AND sp.payment_date >= $2::date AND sp.payment_date <= $3::date
    ORDER BY sp.payment_date ASC, sp.id ASC
    `,
    [id, dateFrom, dateTo]
  );
  const journals = await dataSource.query(
    `
    SELECT
      je.id,
      je.entry_date AS date,
      jl.debit::text AS debit,
      jl.credit::text AS credit,
      je.reference AS reference,
      je.description AS description
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.account_id = $1::uuid
      AND je.deleted_at IS NULL
      AND je.status = 'posted'
      AND je.entry_date >= $2::date
      AND je.entry_date <= $3::date
      AND (je.source_type IS NULL OR je.source_type = 'journal_reversal')
    ORDER BY je.entry_date ASC, je.id ASC, jl.id ASC
    `,
    [supplier.payableAccountId, dateFrom, dateTo]
  );

  const merged: StatementRow[] = [
    ...invoices.map(
      (i: { id: string; date: string | Date; amount: string }) =>
        ({
          kind: 'invoice',
          date: normalizeDateText(i.date),
          id: i.id,
          debit: '0.0000',
          credit: i.amount,
          ref: `Invoice ${i.id.slice(0, 8)}`,
        }) satisfies StatementRow
    ),
    ...payments.map(
      (p: { id: string; date: string | Date; amount: string; reference: string | null }) =>
        ({
          kind: 'payment',
          date: normalizeDateText(p.date),
          id: p.id,
          debit: p.amount,
          credit: '0.0000',
          ref: p.reference || `Payment ${p.id.slice(0, 8)}`,
        }) satisfies StatementRow
    ),
    ...journals.map(
      (j: {
        id: string;
        date: string | Date;
        debit: string;
        credit: string;
        reference: string | null;
        description: string | null;
      }) =>
        ({
          kind: 'journal',
          date: normalizeDateText(j.date),
          id: j.id,
          debit: j.debit,
          credit: j.credit,
          ref: j.reference || j.description || `Journal ${j.id.slice(0, 8)}`,
        }) satisfies StatementRow
    ),
  ];
  merged.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));

  const openingBalance = (parseFloat(opening) - parseFloat(openingManual)).toFixed(4);
  let balance = parseFloat(openingBalance);
  const lines = merged.map((row) => {
    balance += parseFloat(row.credit) - parseFloat(row.debit);
    return { ...row, balance: balance.toFixed(4) };
  });

  return ok({
    data: {
      supplierId: id,
      dateFrom,
      dateTo,
      openingBalance,
      lines,
      closingBalance: balance.toFixed(4),
    },
  });
}

export async function getSupplierPricingHistory(req: Request): Promise<ControllerResult> {
  const { id } = req.params;
  const limit = Math.min(parseInt(String(req.query.limit || '200'), 10) || 200, 500);
  const rows = await dataSource.query(
    `
    SELECT * FROM (
      SELECT pol.id::text AS "lineId", 'purchase_order' AS source, po.order_date AS date,
        pol.product_id AS "productId", pol.unit_price::text AS "unitPrice", po.id AS "documentId"
      FROM purchase_order_lines pol
      INNER JOIN purchase_orders po ON po.id = pol.purchase_order_id
      WHERE po.supplier_id = $1 AND po.status IN ('sent', 'closed')
      UNION ALL
      SELECT sil.id::text AS "lineId", 'supplier_invoice' AS source, si.invoice_date AS date,
        sil.product_id AS "productId", sil.unit_price::text AS "unitPrice", si.id AS "documentId"
      FROM supplier_invoice_lines sil
      INNER JOIN supplier_invoices si ON si.id = sil.supplier_invoice_id
      WHERE si.supplier_id = $1 AND si.status = 'posted'
    ) u
    ORDER BY date DESC, source DESC
    LIMIT $2
    `,
    [id, limit]
  );
  return ok({ data: rows });
}

export async function getSupplier(req: Request): Promise<ControllerResult> {
  const row = await Supplier.findOne({
    where: { id: req.params.id, deletedAt: IsNull() },
  });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  return ok({ data: serializeSupplier(row) });
}

export async function createSupplier(req: Request, body: CreateSupplierInput): Promise<ControllerResult> {
  const b = body;
  const row = await dataSource.transaction(async (tx) => {
    const supplierRepo = tx.getRepository(Supplier);

    const suppAccount = await createSupplierPayableAccount(tx, b.name);

    const createdSupplier = supplierRepo.create({
      name: b.name,
      payableAccountId: suppAccount.id,
      address: b.address ?? undefined,
      city: b.city ?? undefined,
      telephone: b.telephone ?? undefined,
      mobileNo: b.mobileNo ?? undefined,
      email: b.email ?? undefined,
      website: b.website ?? undefined,
      contact: b.contact ?? undefined,
      ntn: b.ntn ?? undefined,
      stn: b.stn ?? undefined,
    });
    await supplierRepo.save(createdSupplier);
    return createdSupplier;
  });
  return created({ data: serializeSupplier(row) });
}

export async function updateSupplier(req: Request, body: UpdateSupplierInput): Promise<ControllerResult> {
  const repo = Supplier.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  const b = body;
  if (b.name !== undefined) row.name = b.name;
  if (b.address !== undefined) row.address = b.address ?? undefined;
  if (b.city !== undefined) row.city = b.city ?? undefined;
  if (b.telephone !== undefined) row.telephone = b.telephone ?? undefined;
  if (b.mobileNo !== undefined) row.mobileNo = b.mobileNo ?? undefined;
  if (b.email !== undefined) row.email = b.email ?? undefined;
  if (b.website !== undefined) row.website = b.website ?? undefined;
  if (b.contact !== undefined) row.contact = b.contact ?? undefined;
  if (b.ntn !== undefined) row.ntn = b.ntn ?? undefined;
  if (b.stn !== undefined) row.stn = b.stn ?? undefined;
  await repo.save(row);
  return ok({ data: serializeSupplier(row) });
}

export async function deleteSupplier(req: Request): Promise<ControllerResult> {
  const repo = Supplier.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  row.deletedAt = new Date();
  await repo.save(row);
  return ok({ data: { id: row.id, deleted: true } });
}

export async function getSupplierSnapshotForAudit(id: string) {
  const s = await Supplier.findOne({ where: { id } });
  return s ? serializeSupplier(s) : undefined;
}
