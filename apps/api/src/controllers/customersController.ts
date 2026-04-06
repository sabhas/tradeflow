import type { Request } from 'express';
import { IsNull } from 'typeorm';
import type { z } from 'zod';
import { dataSource, Customer } from '@tradeflow/db';
import { createCustomerSchema, updateCustomerSchema } from '@tradeflow/shared';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';
import { created, ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export function serializeCustomer(c: Customer) {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    contact: c.contact,
    creditLimit: c.creditLimit,
    paymentTermsId: c.paymentTermsId,
    taxProfileId: c.taxProfileId,
    branchId: c.branchId,
    defaultRouteId: c.defaultRouteId,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    deletedAt: c.deletedAt,
  };
}

export async function listCustomers(req: Request): Promise<ControllerResult> {
  const branchId = resolveBranchId(req);
  const { limit, offset } = getPagination(req);
  const search = (req.query.search as string | undefined)?.trim();

  const qb = Customer
    .createQueryBuilder('c')
    .where('c.deleted_at IS NULL');

  if (branchId) {
    qb.andWhere('(c.branch_id IS NULL OR c.branch_id = :bid)', { bid: branchId });
  }
  if (search) {
    qb.andWhere('LOWER(c.name) LIKE :term', { term: `%${search.toLowerCase()}%` });
  }
  qb.orderBy('c.name', 'ASC').take(limit).skip(offset);

  const [rows, total] = await qb.getManyAndCount();
  return ok({ data: rows.map(serializeCustomer), meta: { total, limit, offset } });
}

type StatementRow =
  | { kind: 'invoice'; date: string; id: string; debit: string; credit: string; ref: string }
  | { kind: 'receipt'; date: string; id: string; debit: string; credit: string; ref: string };

export async function getCustomerStatement(req: Request): Promise<ControllerResult> {
  const { id } = req.params;
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);

  const op = await dataSource.query(
    `
    SELECT (
      (SELECT COALESCE(SUM(i.total::numeric), 0) FROM invoices i
       WHERE i.customer_id = $1 AND i.status = 'posted' AND i.payment_type = 'credit'
         AND i.deleted_at IS NULL
         AND i.invoice_date < $2::date)
      -
      (SELECT COALESCE(SUM(ra.amount::numeric), 0)
       FROM receipt_allocations ra
       INNER JOIN receipts r ON r.id = ra.receipt_id
       INNER JOIN invoices i ON i.id = ra.invoice_id AND i.deleted_at IS NULL
       WHERE i.customer_id = $1 AND i.status = 'posted' AND i.payment_type = 'credit'
         AND r.receipt_date < $2::date)
    )::text AS opening
    `,
    [id, dateFrom]
  );
  const opening = op[0]?.opening ?? '0.0000';

  const invoices = await dataSource.query(
    `
    SELECT i.id, i.invoice_date AS date, i.total::text AS amount, i.due_date AS "dueDate"
    FROM invoices i
    WHERE i.customer_id = $1 AND i.status = 'posted' AND i.payment_type = 'credit'
      AND i.deleted_at IS NULL
      AND i.invoice_date >= $2::date AND i.invoice_date <= $3::date
    ORDER BY i.invoice_date ASC, i.id ASC
    `,
    [id, dateFrom, dateTo]
  );

  const receipts = await dataSource.query(
    `
    SELECT r.id, r.receipt_date AS date, r.amount::text AS amount, r.reference AS reference
    FROM receipts r
    WHERE r.customer_id = $1
      AND r.receipt_date >= $2::date AND r.receipt_date <= $3::date
    ORDER BY r.receipt_date ASC, r.id ASC
    `,
    [id, dateFrom, dateTo]
  );

  const merged: StatementRow[] = [
    ...invoices.map(
      (i: { id: string; date: string; amount: string }) =>
        ({
          kind: 'invoice',
          date: i.date,
          id: i.id,
          debit: i.amount,
          credit: '0.0000',
          ref: `Invoice ${i.id.slice(0, 8)}`,
        }) satisfies StatementRow
    ),
    ...receipts.map(
      (r: { id: string; date: string; amount: string; reference: string | null }) =>
        ({
          kind: 'receipt',
          date: r.date,
          id: r.id,
          debit: '0.0000',
          credit: r.amount,
          ref: r.reference || `Receipt ${r.id.slice(0, 8)}`,
        }) satisfies StatementRow
    ),
  ];
  merged.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));

  let balance = parseFloat(opening);
  const lines = merged.map((row) => {
    balance += parseFloat(row.debit) - parseFloat(row.credit);
    return { ...row, balance: balance.toFixed(4) };
  });

  return ok({
    data: {
      customerId: id,
      dateFrom,
      dateTo,
      openingBalance: opening,
      lines,
      closingBalance: balance.toFixed(4),
    },
  });
}

export async function getCustomer(req: Request): Promise<ControllerResult> {
  const row = await Customer.findOne({
    where: { id: req.params.id, deletedAt: IsNull() },
    relations: ['paymentTerms', 'taxProfile'],
  });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  return ok({ data: serializeCustomer(row) });
}

export async function createCustomer(req: Request, body: CreateCustomerInput): Promise<ControllerResult> {
  const b = body;
  const repo = Customer.getRepository();
  const row = repo.create({
    name: b.name,
    type: b.type,
    contact: b.contact ?? undefined,
    creditLimit: b.creditLimit ?? '0',
    paymentTermsId: b.paymentTermsId ?? undefined,
    taxProfileId: b.taxProfileId ?? undefined,
    defaultRouteId: b.defaultRouteId ?? undefined,
    branchId: b.branchId ?? req.user?.branchId ?? undefined,
  });
  await repo.save(row);
  return created({ data: serializeCustomer(row) });
}

export async function updateCustomer(req: Request, body: UpdateCustomerInput): Promise<ControllerResult> {
  const repo = Customer.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  const b = body;
  if (b.name !== undefined) row.name = b.name;
  if (b.type !== undefined) row.type = b.type;
  if (b.contact !== undefined) row.contact = b.contact ?? undefined;
  if (b.creditLimit !== undefined) row.creditLimit = b.creditLimit;
  if (b.paymentTermsId !== undefined) row.paymentTermsId = b.paymentTermsId ?? undefined;
  if (b.taxProfileId !== undefined) row.taxProfileId = b.taxProfileId ?? undefined;
  if (b.branchId !== undefined) row.branchId = b.branchId ?? undefined;
  if (b.defaultRouteId !== undefined) row.defaultRouteId = b.defaultRouteId ?? undefined;
  await repo.save(row);
  return ok({ data: serializeCustomer(row) });
}

export async function deleteCustomer(req: Request): Promise<ControllerResult> {
  const repo = Customer.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  row.deletedAt = new Date();
  await repo.save(row);
  return ok({ data: { id: row.id, deleted: true } });
}

export async function getCustomerSnapshotForAudit(id: string) {
  const c = await Customer.findOne({ where: { id } });
  return c ? serializeCustomer(c) : undefined;
}
