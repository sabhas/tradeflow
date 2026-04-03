import { Router } from 'express';
import { dataSource } from '@tradeflow/db';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { resolveBranchId } from '../utils/branchScope';

export const reportsRouter = Router();
reportsRouter.use(authMiddleware, loadUser);

/** Receivables aging by customer (posted credit invoices with open balance). */
reportsRouter.get('/aging', requirePermission('sales', 'read'), async (req, res) => {
  const asOf = ((req.query.asOf as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const branchId = resolveBranchId(req);

  const rows = await dataSource.query(
    `
    SELECT
      i.id AS "invoiceId",
      i.customer_id AS "customerId",
      c.name AS "customerName",
      i.due_date AS "dueDate",
      i.invoice_date AS "invoiceDate",
      i.total::text AS "total",
      COALESCE((
        SELECT SUM(ra.amount)::text
        FROM receipt_allocations ra
        WHERE ra.invoice_id = i.id
      ), '0') AS "allocated",
      (i.total::numeric - COALESCE((
        SELECT SUM(ra.amount)
        FROM receipt_allocations ra
        WHERE ra.invoice_id = i.id
      ), 0))::text AS "openAmount"
    FROM invoices i
    INNER JOIN customers c ON c.id = i.customer_id AND c.deleted_at IS NULL
    WHERE i.status = 'posted'
      AND i.payment_type = 'credit'
      AND ($1::uuid IS NULL OR i.branch_id IS NULL OR i.branch_id = $1::uuid)
    `,
    [branchId || null]
  );

  const asOfMs = new Date(`${asOf}T12:00:00.000Z`).getTime();
  type Bucket = { current: string; d1_30: string; d31_60: string; d61_90: string; d90p: string };
  const byCustomer = new Map<
    string,
    { customerName: string; buckets: Bucket; totalOpen: number }
  >();

  function emptyBucket(): Bucket {
    return { current: '0.0000', d1_30: '0.0000', d31_60: '0.0000', d61_90: '0.0000', d90p: '0.0000' };
  }

  function addToBucket(b: Bucket, key: keyof Bucket, amt: number): void {
    const cur = parseFloat(b[key]);
    b[key] = (cur + amt).toFixed(4);
  }

  for (const r of rows) {
    const open = parseFloat(r.openAmount);
    if (open <= 0.00005) continue;
    const dueMs = new Date(`${r.dueDate}T12:00:00.000Z`).getTime();
    const daysPast = Math.floor((asOfMs - dueMs) / (24 * 3600 * 1000));
    let key: keyof Bucket = 'current';
    if (daysPast >= 1 && daysPast <= 30) key = 'd1_30';
    else if (daysPast >= 31 && daysPast <= 60) key = 'd31_60';
    else if (daysPast >= 61 && daysPast <= 90) key = 'd61_90';
    else if (daysPast > 90) key = 'd90p';

    if (!byCustomer.has(r.customerId)) {
      byCustomer.set(r.customerId, { customerName: r.customerName, buckets: emptyBucket(), totalOpen: 0 });
    }
    const agg = byCustomer.get(r.customerId)!;
    agg.totalOpen += open;
    addToBucket(agg.buckets, key, open);
  }

  const data = [...byCustomer.entries()].map(([customerId, v]) => ({
    customerId,
    customerName: v.customerName,
    totalOpen: v.totalOpen.toFixed(4),
    buckets: v.buckets,
  }));

  res.json({ data, meta: { asOf } });
});

/** Payables aging by supplier (posted supplier invoices with open balance). */
reportsRouter.get('/payables-aging', requirePermission('purchases.reports', 'read'), async (req, res) => {
  const asOf = ((req.query.asOf as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const branchId = resolveBranchId(req);

  const rows = await dataSource.query(
    `
    SELECT
      si.id AS "invoiceId",
      si.supplier_id AS "supplierId",
      s.name AS "supplierName",
      si.due_date AS "dueDate",
      si.invoice_date AS "invoiceDate",
      si.total::text AS total,
      COALESCE((
        SELECT SUM(spa.amount)::text
        FROM supplier_payment_allocations spa
        WHERE spa.supplier_invoice_id = si.id
      ), '0') AS allocated,
      (si.total::numeric - COALESCE((
        SELECT SUM(spa.amount)
        FROM supplier_payment_allocations spa
        WHERE spa.supplier_invoice_id = si.id
      ), 0))::text AS "openAmount"
    FROM supplier_invoices si
    INNER JOIN suppliers s ON s.id = si.supplier_id AND s.deleted_at IS NULL
    WHERE si.status = 'posted'
      AND ($1::uuid IS NULL OR si.branch_id IS NULL OR si.branch_id = $1::uuid)
    `,
    [branchId || null]
  );

  const asOfMs = new Date(`${asOf}T12:00:00.000Z`).getTime();
  type Bucket = { current: string; d1_30: string; d31_60: string; d61_90: string; d90p: string };
  const bySupplier = new Map<string, { supplierName: string; buckets: Bucket; totalOpen: number }>();

  function emptyBucket(): Bucket {
    return { current: '0.0000', d1_30: '0.0000', d31_60: '0.0000', d61_90: '0.0000', d90p: '0.0000' };
  }

  function addToBucket(b: Bucket, key: keyof Bucket, amt: number): void {
    const cur = parseFloat(b[key]);
    b[key] = (cur + amt).toFixed(4);
  }

  for (const r of rows) {
    const open = parseFloat(r.openAmount);
    if (open <= 0.00005) continue;
    const dueMs = new Date(`${r.dueDate}T12:00:00.000Z`).getTime();
    const daysPast = Math.floor((asOfMs - dueMs) / (24 * 3600 * 1000));
    let key: keyof Bucket = 'current';
    if (daysPast >= 1 && daysPast <= 30) key = 'd1_30';
    else if (daysPast >= 31 && daysPast <= 60) key = 'd31_60';
    else if (daysPast >= 61 && daysPast <= 90) key = 'd61_90';
    else if (daysPast > 90) key = 'd90p';

    if (!bySupplier.has(r.supplierId)) {
      bySupplier.set(r.supplierId, { supplierName: r.supplierName, buckets: emptyBucket(), totalOpen: 0 });
    }
    const agg = bySupplier.get(r.supplierId)!;
    agg.totalOpen += open;
    addToBucket(agg.buckets, key, open);
  }

  const data = [...bySupplier.entries()].map(([supplierId, v]) => ({
    supplierId,
    supplierName: v.supplierName,
    totalOpen: v.totalOpen.toFixed(4),
    buckets: v.buckets,
  }));

  res.json({ data, meta: { asOf } });
});

/** Posted journal activity by account for date range (trial balance). */
reportsRouter.get('/trial-balance', requirePermission('accounting', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);

  const rows = await dataSource.query(
    `
    SELECT
      a.id AS "accountId",
      a.code,
      a.name,
      a.type,
      COALESCE(SUM(jl.debit), 0)::text AS debit,
      COALESCE(SUM(jl.credit), 0)::text AS credit
    FROM accounts a
    INNER JOIN journal_lines jl ON jl.account_id = a.id
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      AND je.status = 'posted'
      AND je.entry_date >= $1::date
      AND je.entry_date <= $2::date
      AND ($3::uuid IS NULL OR je.branch_id IS NULL OR je.branch_id = $3::uuid)
    WHERE ($3::uuid IS NULL OR a.branch_id IS NULL OR a.branch_id = $3::uuid)
    GROUP BY a.id, a.code, a.name, a.type
    HAVING COALESCE(SUM(jl.debit), 0) != 0 OR COALESCE(SUM(jl.credit), 0) != 0
    ORDER BY a.code
    `,
    [dateFrom, dateTo, branchId || null]
  );

  let totalDebit = 0;
  let totalCredit = 0;
  for (const r of rows) {
    totalDebit += parseFloat(r.debit);
    totalCredit += parseFloat(r.credit);
  }

  res.json({
    data: rows,
    meta: { dateFrom, dateTo, totalDebit: totalDebit.toFixed(4), totalCredit: totalCredit.toFixed(4) },
  });
});

/** Profit & loss: income and expense accounts for period. */
reportsRouter.get('/profit-loss', requirePermission('accounting', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);

  const rows = await dataSource.query(
    `
    SELECT
      a.id AS "accountId",
      a.code,
      a.name,
      a.type,
      COALESCE(SUM(jl.debit), 0)::text AS debit,
      COALESCE(SUM(jl.credit), 0)::text AS credit
    FROM accounts a
    INNER JOIN journal_lines jl ON jl.account_id = a.id
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      AND je.status = 'posted'
      AND je.entry_date >= $1::date
      AND je.entry_date <= $2::date
      AND ($3::uuid IS NULL OR je.branch_id IS NULL OR je.branch_id = $3::uuid)
    WHERE a.type IN ('income', 'expense')
      AND ($3::uuid IS NULL OR a.branch_id IS NULL OR a.branch_id = $3::uuid)
    GROUP BY a.id, a.code, a.name, a.type
    HAVING COALESCE(SUM(jl.debit), 0) != 0 OR COALESCE(SUM(jl.credit), 0) != 0
    ORDER BY a.type DESC, a.code
    `,
    [dateFrom, dateTo, branchId || null]
  );

  let incomeNet = 0;
  let expenseNet = 0;
  for (const r of rows) {
    const d = parseFloat(r.debit);
    const c = parseFloat(r.credit);
    if (r.type === 'income') incomeNet += c - d;
    else expenseNet += d - c;
  }
  const netProfit = incomeNet - expenseNet;

  res.json({
    data: rows,
    meta: {
      dateFrom,
      dateTo,
      incomeNet: incomeNet.toFixed(4),
      expenseNet: expenseNet.toFixed(4),
      netProfit: netProfit.toFixed(4),
    },
  });
});

/** Balance sheet: assets, liabilities, equity as of date (cumulative posted journals). */
reportsRouter.get('/balance-sheet', requirePermission('accounting', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const asOfDate = ((req.query.asOfDate as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);

  const rows = await dataSource.query(
    `
    SELECT
      a.id AS "accountId",
      a.code,
      a.name,
      a.type,
      COALESCE(SUM(jl.debit), 0)::text AS debit,
      COALESCE(SUM(jl.credit), 0)::text AS credit
    FROM accounts a
    INNER JOIN journal_lines jl ON jl.account_id = a.id
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      AND je.status = 'posted'
      AND je.entry_date <= $1::date
      AND ($2::uuid IS NULL OR je.branch_id IS NULL OR je.branch_id = $2::uuid)
    WHERE a.type IN ('asset', 'liability', 'equity')
      AND ($2::uuid IS NULL OR a.branch_id IS NULL OR a.branch_id = $2::uuid)
    GROUP BY a.id, a.code, a.name, a.type
    HAVING COALESCE(SUM(jl.debit), 0) != 0 OR COALESCE(SUM(jl.credit), 0) != 0
    ORDER BY a.type, a.code
    `,
    [asOfDate, branchId || null]
  );

  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  for (const r of rows) {
    const d = parseFloat(r.debit);
    const c = parseFloat(r.credit);
    if (r.type === 'asset') assets += d - c;
    else if (r.type === 'liability') liabilities += c - d;
    else equity += c - d;
  }

  res.json({
    data: rows,
    meta: {
      asOfDate,
      totalAssets: assets.toFixed(4),
      totalLiabilities: liabilities.toFixed(4),
      totalEquity: equity.toFixed(4),
      liabilitiesPlusEquity: (liabilities + equity).toFixed(4),
    },
  });
});
