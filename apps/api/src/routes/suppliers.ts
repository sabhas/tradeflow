import { Router } from 'express';
import { IsNull } from 'typeorm';
import { dataSource, Supplier } from '@tradeflow/db';
import { createSupplierSchema, updateSupplierSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';

export const suppliersRouter = Router();
suppliersRouter.use(authMiddleware, loadUser);

function serialize(s: Supplier) {
  return {
    id: s.id,
    name: s.name,
    contact: s.contact,
    paymentTermsId: s.paymentTermsId,
    taxProfileId: s.taxProfileId,
    branchId: s.branchId,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    deletedAt: s.deletedAt,
  };
}

suppliersRouter.get('/', requirePermission('masters.suppliers', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const { limit, offset } = getPagination(req);
  const search = (req.query.search as string | undefined)?.trim();

  const qb = dataSource
    .getRepository(Supplier)
    .createQueryBuilder('s')
    .where('s.deleted_at IS NULL');

  if (branchId) {
    qb.andWhere('(s.branch_id IS NULL OR s.branch_id = :bid)', { bid: branchId });
  }
  if (search) {
    qb.andWhere('LOWER(s.name) LIKE :term', { term: `%${search.toLowerCase()}%` });
  }
  qb.orderBy('s.name', 'ASC').take(limit).skip(offset);

  const [rows, total] = await qb.getManyAndCount();
  res.json({ data: rows.map(serialize), meta: { total, limit, offset } });
});

suppliersRouter.get('/:id/statement', requirePermission('purchases.reports', 'read'), async (req, res) => {
  const { id } = req.params;
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);

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

  type Row =
    | { kind: 'invoice'; date: string; id: string; debit: string; credit: string; ref: string }
    | { kind: 'payment'; date: string; id: string; debit: string; credit: string; ref: string };

  const merged: Row[] = [
    ...invoices.map(
      (i: { id: string; date: string; amount: string }) =>
        ({
          kind: 'invoice',
          date: i.date,
          id: i.id,
          debit: i.amount,
          credit: '0.0000',
          ref: `Invoice ${i.id.slice(0, 8)}`,
        }) satisfies Row
    ),
    ...payments.map(
      (p: { id: string; date: string; amount: string; reference: string | null }) =>
        ({
          kind: 'payment',
          date: p.date,
          id: p.id,
          debit: '0.0000',
          credit: p.amount,
          ref: p.reference || `Payment ${p.id.slice(0, 8)}`,
        }) satisfies Row
    ),
  ];
  merged.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));

  let balance = parseFloat(opening);
  const lines = merged.map((row) => {
    balance += parseFloat(row.debit) - parseFloat(row.credit);
    return { ...row, balance: balance.toFixed(4) };
  });

  res.json({
    data: {
      supplierId: id,
      dateFrom,
      dateTo,
      openingBalance: opening,
      lines,
      closingBalance: balance.toFixed(4),
    },
  });
});

suppliersRouter.get('/:id/pricing-history', requirePermission('purchases.reports', 'read'), async (req, res) => {
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
  res.json({ data: rows });
});

suppliersRouter.get('/:id', requirePermission('masters.suppliers', 'read'), async (req, res) => {
  const row = await dataSource.getRepository(Supplier).findOne({
    where: { id: req.params.id, deletedAt: IsNull() },
    relations: ['paymentTerms', 'taxProfile'],
  });
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ data: serialize(row) });
});

suppliersRouter.post(
  '/',
  requirePermission('masters.suppliers', 'write'),
  auditMiddleware({ entity: 'Supplier', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createSupplierSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const repo = dataSource.getRepository(Supplier);
    const row = repo.create({
      name: b.name,
      contact: b.contact ?? undefined,
      paymentTermsId: b.paymentTermsId ?? undefined,
      taxProfileId: b.taxProfileId ?? undefined,
      branchId: b.branchId ?? req.user?.branchId ?? undefined,
    });
    await repo.save(row);
    res.status(201).json({ data: serialize(row) });
  }
);

suppliersRouter.patch(
  '/:id',
  requirePermission('masters.suppliers', 'write'),
  auditMiddleware({
    entity: 'Supplier',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => {
      const s = await dataSource.getRepository(Supplier).findOne({ where: { id: req.params.id } });
      return s ? serialize(s) : undefined;
    },
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = updateSupplierSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const repo = dataSource.getRepository(Supplier);
    const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const b = parsed.data;
    if (b.name !== undefined) row.name = b.name;
    if (b.contact !== undefined) row.contact = b.contact ?? undefined;
    if (b.paymentTermsId !== undefined) row.paymentTermsId = b.paymentTermsId ?? undefined;
    if (b.taxProfileId !== undefined) row.taxProfileId = b.taxProfileId ?? undefined;
    if (b.branchId !== undefined) row.branchId = b.branchId ?? undefined;
    await repo.save(row);
    res.json({ data: serialize(row) });
  }
);

suppliersRouter.delete(
  '/:id',
  requirePermission('masters.suppliers', 'write'),
  auditMiddleware({
    entity: 'Supplier',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => {
      const s = await dataSource.getRepository(Supplier).findOne({ where: { id: req.params.id } });
      return s ? serialize(s) : undefined;
    },
  }),
  async (req, res) => {
    const repo = dataSource.getRepository(Supplier);
    const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    row.deletedAt = new Date();
    await repo.save(row);
    res.json({ data: { id: row.id, deleted: true } });
  }
);
