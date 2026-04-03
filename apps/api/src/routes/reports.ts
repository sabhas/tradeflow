import { NextFunction, Request, Response, Router } from 'express';
import { dataSource } from '@tradeflow/db';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { resolveBranchId } from '../utils/branchScope';

function requireTaxSummaryAccess(req: Request, res: Response, next: NextFunction) {
  const p = req.auth?.permissions ?? [];
  const ok =
    p.includes('*') || p.includes('sales:read') || p.includes('purchases.reports:read');
  if (!ok) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Permission sales:read or purchases.reports:read required',
    });
    return;
  }
  next();
}

export const reportsRouter = Router();
reportsRouter.use(authMiddleware, loadUser);

/** Posted invoices aggregated by calendar day (operational sales). */
reportsRouter.get('/daily-sales', requirePermission('sales', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const customerId = (req.query.customerId as string)?.trim() || null;
  const warehouseId = (req.query.warehouseId as string)?.trim() || null;

  const rows = await dataSource.query(
    `
    SELECT
      i.invoice_date::text AS date,
      COUNT(*)::int AS count,
      SUM(i.total::numeric)::text AS "totalAmount"
    FROM invoices i
    WHERE i.status = 'posted'
      AND i.deleted_at IS NULL
      AND i.invoice_date >= $1::date
      AND i.invoice_date <= $2::date
      AND ($3::uuid IS NULL OR i.customer_id = $3::uuid)
      AND ($4::uuid IS NULL OR i.warehouse_id = $4::uuid)
      AND ($5::uuid IS NULL OR i.branch_id IS NULL OR i.branch_id = $5::uuid)
    GROUP BY i.invoice_date
    ORDER BY i.invoice_date
    `,
    [dateFrom, dateTo, customerId, warehouseId, branchId || null]
  );

  let grandTotal = 0;
  let invoiceCount = 0;
  for (const r of rows) {
    grandTotal += parseFloat(r.totalAmount);
    invoiceCount += Number(r.count);
  }

  res.json({
    data: rows,
    meta: { dateFrom, dateTo, customerId, warehouseId, grandTotal: grandTotal.toFixed(4), invoiceCount },
  });
});

/** Inventory movements in period with optional product / warehouse filters. */
reportsRouter.get('/stock-movement', requirePermission('inventory', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const productId = (req.query.productId as string)?.trim() || null;
  const warehouseId = (req.query.warehouseId as string)?.trim() || null;

  const rows = await dataSource.query(
    `
    SELECT
      im.movement_date::text AS date,
      im.id AS "movementId",
      p.id AS "productId",
      p.sku AS "productSku",
      p.name AS "productName",
      im.ref_type AS type,
      im.quantity_delta::text AS qty,
      im.ref_id::text AS "refId",
      w.id AS "warehouseId",
      w.name AS "warehouseName",
      COALESCE(im.notes, '') AS notes
    FROM inventory_movements im
    INNER JOIN products p ON p.id = im.product_id AND p.deleted_at IS NULL
    INNER JOIN warehouses w ON w.id = im.warehouse_id
    WHERE im.movement_date >= $1::date
      AND im.movement_date <= $2::date
      AND ($3::uuid IS NULL OR im.product_id = $3::uuid)
      AND ($4::uuid IS NULL OR im.warehouse_id = $4::uuid)
      AND ($5::uuid IS NULL OR im.branch_id IS NULL OR im.branch_id = $5::uuid)
    ORDER BY im.movement_date, im.created_at, im.id
    `,
    [dateFrom, dateTo, productId, warehouseId, branchId || null]
  );

  res.json({ data: rows, meta: { dateFrom, dateTo, productId, warehouseId, rowCount: rows.length } });
});

/** Products ranked by quantity or line value sold in period (posted invoices). */
reportsRouter.get('/fast-moving', requirePermission('sales', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const rawLimit = parseInt(String(req.query.limit || '50'), 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 50;
  const sortBy = (req.query.sortBy as string) === 'value' ? 'value' : 'quantity';

  const orderSql =
    sortBy === 'value'
      ? 'SUM((il.quantity::numeric * il.unit_price::numeric - il.discount_amount::numeric)) DESC NULLS LAST'
      : 'SUM(il.quantity::numeric) DESC NULLS LAST';

  const rows = await dataSource.query(
    `
    SELECT
      il.product_id AS "productId",
      p.sku AS "productSku",
      p.name AS "productName",
      SUM(il.quantity::numeric)::text AS "quantitySold",
      SUM((il.quantity::numeric * il.unit_price::numeric - il.discount_amount::numeric))::text AS "lineValue"
    FROM invoice_lines il
    INNER JOIN invoices i ON i.id = il.invoice_id AND i.deleted_at IS NULL
    INNER JOIN products p ON p.id = il.product_id AND p.deleted_at IS NULL
    WHERE i.status = 'posted'
      AND i.invoice_date >= $1::date
      AND i.invoice_date <= $2::date
      AND ($3::uuid IS NULL OR i.branch_id IS NULL OR i.branch_id = $3::uuid)
    GROUP BY il.product_id, p.sku, p.name
    ORDER BY ${orderSql}
    LIMIT $4
    `,
    [dateFrom, dateTo, branchId || null, limit]
  );

  res.json({ data: rows, meta: { dateFrom, dateTo, limit, sortBy } });
});

/** Expense accounts with period activity (P&amp;L expense slice). */
reportsRouter.get('/expense-analysis', requirePermission('accounting', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);

  const rows = await dataSource.query(
    `
    SELECT
      a.id AS "accountId",
      a.code,
      a.name,
      COALESCE(SUM(jl.debit), 0)::text AS debit,
      COALESCE(SUM(jl.credit), 0)::text AS credit,
      (COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0))::text AS "netExpense"
    FROM accounts a
    INNER JOIN journal_lines jl ON jl.account_id = a.id
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      AND je.deleted_at IS NULL
      AND je.status = 'posted'
      AND je.entry_date >= $1::date
      AND je.entry_date <= $2::date
      AND ($3::uuid IS NULL OR je.branch_id IS NULL OR je.branch_id = $3::uuid)
    WHERE a.type = 'expense'
      AND ($3::uuid IS NULL OR a.branch_id IS NULL OR a.branch_id = $3::uuid)
    GROUP BY a.id, a.code, a.name
    HAVING COALESCE(SUM(jl.debit), 0) != 0 OR COALESCE(SUM(jl.credit), 0) != 0
    ORDER BY a.code
    `,
    [dateFrom, dateTo, branchId || null]
  );

  let totalNet = 0;
  for (const r of rows) {
    totalNet += parseFloat(r.netExpense);
  }

  res.json({
    data: rows,
    meta: { dateFrom, dateTo, totalNetExpense: totalNet.toFixed(4) },
  });
});

async function receivablesAgingHandler(req: Request, res: Response) {
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
      AND i.deleted_at IS NULL
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
}

reportsRouter.get('/aging', requirePermission('sales', 'read'), receivablesAgingHandler);
reportsRouter.get('/receivables-aging', requirePermission('sales', 'read'), receivablesAgingHandler);

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
      AND je.deleted_at IS NULL
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
      AND je.deleted_at IS NULL
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
      AND je.deleted_at IS NULL
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

/** Posted sales invoice lines with tax (audit trail). */
reportsRouter.get('/tax-collected', requirePermission('sales', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const taxProfileId = (req.query.taxProfileId as string)?.trim() || null;

  const rows = await dataSource.query(
    `
    SELECT
      il.id AS "lineId",
      i.id AS "invoiceId",
      i.invoice_date AS "invoiceDate",
      i.customer_id AS "customerId",
      c.name AS "customerName",
      il.tax_profile_id AS "taxProfileId",
      tp.name AS "taxProfileName",
      tp.rate::text AS "taxProfileRate",
      tp.is_inclusive AS "taxProfileIsInclusive",
      il.product_id AS "productId",
      p.sku AS "productSku",
      p.name AS "productName",
      il.quantity::text AS "quantity",
      il.unit_price::text AS "unitPrice",
      il.discount_amount::text AS "discountAmount",
      il.tax_amount::text AS "taxAmount",
      (il.quantity::numeric * il.unit_price::numeric - il.discount_amount::numeric)::text AS "lineNetBeforeTax"
    FROM invoice_lines il
    INNER JOIN invoices i ON i.id = il.invoice_id AND i.deleted_at IS NULL
    INNER JOIN customers c ON c.id = i.customer_id AND c.deleted_at IS NULL
    INNER JOIN products p ON p.id = il.product_id AND p.deleted_at IS NULL
    LEFT JOIN tax_profiles tp ON tp.id = il.tax_profile_id
    WHERE i.status = 'posted'
      AND i.invoice_date >= $1::date
      AND i.invoice_date <= $2::date
      AND ($3::uuid IS NULL OR il.tax_profile_id = $3::uuid)
      AND ($4::uuid IS NULL OR i.branch_id IS NULL OR i.branch_id = $4::uuid)
    ORDER BY i.invoice_date, i.id, il.id
    `,
    [dateFrom, dateTo, taxProfileId, branchId || null]
  );

  let totalTax = 0;
  for (const r of rows) {
    totalTax += parseFloat(r.taxAmount);
  }

  res.json({
    data: rows,
    meta: { dateFrom, dateTo, taxProfileId, totalTax: totalTax.toFixed(4) },
  });
});

/** Posted supplier invoice lines with tax (audit trail). */
reportsRouter.get('/tax-paid', requirePermission('purchases.reports', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const taxProfileId = (req.query.taxProfileId as string)?.trim() || null;

  const rows = await dataSource.query(
    `
    SELECT
      sil.id AS "lineId",
      si.id AS "supplierInvoiceId",
      si.invoice_number AS "supplierInvoiceNumber",
      si.invoice_date AS "invoiceDate",
      si.supplier_id AS "supplierId",
      s.name AS "supplierName",
      sil.tax_profile_id AS "taxProfileId",
      tp.name AS "taxProfileName",
      tp.rate::text AS "taxProfileRate",
      tp.is_inclusive AS "taxProfileIsInclusive",
      sil.product_id AS "productId",
      p.sku AS "productSku",
      p.name AS "productName",
      sil.quantity::text AS "quantity",
      sil.unit_price::text AS "unitPrice",
      sil.discount_amount::text AS "discountAmount",
      sil.tax_amount::text AS "taxAmount",
      (sil.quantity::numeric * sil.unit_price::numeric - sil.discount_amount::numeric)::text AS "lineNetBeforeTax"
    FROM supplier_invoice_lines sil
    INNER JOIN supplier_invoices si ON si.id = sil.supplier_invoice_id
    INNER JOIN suppliers s ON s.id = si.supplier_id AND s.deleted_at IS NULL
    INNER JOIN products p ON p.id = sil.product_id AND p.deleted_at IS NULL
    LEFT JOIN tax_profiles tp ON tp.id = sil.tax_profile_id
    WHERE si.status = 'posted'
      AND si.invoice_date >= $1::date
      AND si.invoice_date <= $2::date
      AND ($3::uuid IS NULL OR sil.tax_profile_id = $3::uuid)
      AND ($4::uuid IS NULL OR si.branch_id IS NULL OR si.branch_id = $4::uuid)
    ORDER BY si.invoice_date, si.id, sil.id
    `,
    [dateFrom, dateTo, taxProfileId, branchId || null]
  );

  let totalTax = 0;
  for (const r of rows) {
    totalTax += parseFloat(r.taxAmount);
  }

  res.json({
    data: rows,
    meta: { dateFrom, dateTo, taxProfileId, totalTax: totalTax.toFixed(4) },
  });
});

/** Collected vs paid tax by tax profile (respects caller permissions per side). */
reportsRouter.get('/tax-summary', requireTaxSummaryAccess, async (req, res) => {
  const branchId = resolveBranchId(req);
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10));
  const p = req.auth?.permissions ?? [];
  const all = p.includes('*');
  const canSales = all || p.includes('sales:read');
  const canPurch = all || p.includes('purchases.reports:read');

  type AggRow = {
    taxProfileId: string | null;
    taxProfileName: string;
    taxProfileRate: string | null;
    taxProfileIsInclusive: boolean | null;
    amount: string;
  };

  let collected: AggRow[] = [];
  let paid: AggRow[] = [];

  if (canSales) {
    collected = await dataSource.query(
      `
      SELECT
        il.tax_profile_id AS "taxProfileId",
        COALESCE(tp.name, '(No profile)') AS "taxProfileName",
        tp.rate::text AS "taxProfileRate",
        tp.is_inclusive AS "taxProfileIsInclusive",
        SUM(il.tax_amount)::text AS "amount"
      FROM invoice_lines il
      INNER JOIN invoices i ON i.id = il.invoice_id AND i.deleted_at IS NULL
      LEFT JOIN tax_profiles tp ON tp.id = il.tax_profile_id
      WHERE i.status = 'posted'
        AND i.invoice_date >= $1::date
        AND i.invoice_date <= $2::date
        AND ($3::uuid IS NULL OR i.branch_id IS NULL OR i.branch_id = $3::uuid)
      GROUP BY il.tax_profile_id, tp.name, tp.rate, tp.is_inclusive
      ORDER BY "taxProfileName"
      `,
      [dateFrom, dateTo, branchId || null]
    );
  }

  if (canPurch) {
    paid = await dataSource.query(
      `
      SELECT
        sil.tax_profile_id AS "taxProfileId",
        COALESCE(tp.name, '(No profile)') AS "taxProfileName",
        tp.rate::text AS "taxProfileRate",
        tp.is_inclusive AS "taxProfileIsInclusive",
        SUM(sil.tax_amount)::text AS "amount"
      FROM supplier_invoice_lines sil
      INNER JOIN supplier_invoices si ON si.id = sil.supplier_invoice_id
      LEFT JOIN tax_profiles tp ON tp.id = sil.tax_profile_id
      WHERE si.status = 'posted'
        AND si.invoice_date >= $1::date
        AND si.invoice_date <= $2::date
        AND ($3::uuid IS NULL OR si.branch_id IS NULL OR si.branch_id = $3::uuid)
      GROUP BY sil.tax_profile_id, tp.name, tp.rate, tp.is_inclusive
      ORDER BY "taxProfileName"
      `,
      [dateFrom, dateTo, branchId || null]
    );
  }

  const byKey = new Map<
    string,
    {
      taxProfileId: string | null;
      taxProfileName: string;
      taxProfileRate: string | null;
      taxProfileIsInclusive: boolean | null;
      collected: string;
      paid: string;
    }
  >();

  function keyFor(id: string | null, name: string): string {
    return id ?? `__none__:${name}`;
  }

  for (const r of collected) {
    const k = keyFor(r.taxProfileId, r.taxProfileName);
    if (!byKey.has(k)) {
      byKey.set(k, {
        taxProfileId: r.taxProfileId,
        taxProfileName: r.taxProfileName,
        taxProfileRate: r.taxProfileRate,
        taxProfileIsInclusive: r.taxProfileIsInclusive,
        collected: '0.0000',
        paid: '0.0000',
      });
    }
    const e = byKey.get(k)!;
    e.collected = (parseFloat(e.collected) + parseFloat(r.amount)).toFixed(4);
  }

  for (const r of paid) {
    const k = keyFor(r.taxProfileId, r.taxProfileName);
    if (!byKey.has(k)) {
      byKey.set(k, {
        taxProfileId: r.taxProfileId,
        taxProfileName: r.taxProfileName,
        taxProfileRate: r.taxProfileRate,
        taxProfileIsInclusive: r.taxProfileIsInclusive,
        collected: '0.0000',
        paid: '0.0000',
      });
    }
    const e = byKey.get(k)!;
    e.paid = (parseFloat(e.paid) + parseFloat(r.amount)).toFixed(4);
  }

  const byProfile = [...byKey.values()].sort((a, b) =>
    a.taxProfileName.localeCompare(b.taxProfileName)
  );

  let totalCollected = 0;
  let totalPaid = 0;
  for (const row of byProfile) {
    totalCollected += parseFloat(row.collected);
    totalPaid += parseFloat(row.paid);
  }

  let collectedInvoiceCount = '0';
  let paidInvoiceCount = '0';
  if (canSales) {
    const cnt = await dataSource.query(
      `SELECT COUNT(DISTINCT i.id)::text AS c FROM invoices i
       WHERE i.status = 'posted' AND i.deleted_at IS NULL
       AND i.invoice_date >= $1::date AND i.invoice_date <= $2::date
       AND ($3::uuid IS NULL OR i.branch_id IS NULL OR i.branch_id = $3::uuid)`,
      [dateFrom, dateTo, branchId || null]
    );
    collectedInvoiceCount = cnt[0]?.c ?? '0';
  }
  if (canPurch) {
    const cnt = await dataSource.query(
      `SELECT COUNT(DISTINCT si.id)::text AS c FROM supplier_invoices si
       WHERE si.status = 'posted' AND si.invoice_date >= $1::date AND si.invoice_date <= $2::date
       AND ($3::uuid IS NULL OR si.branch_id IS NULL OR si.branch_id = $3::uuid)`,
      [dateFrom, dateTo, branchId || null]
    );
    paidInvoiceCount = cnt[0]?.c ?? '0';
  }

  res.json({
    data: {
      byProfile,
      breakdown: { collectedInvoiceCount, paidInvoiceCount },
    },
    meta: {
      dateFrom,
      dateTo,
      totalCollected: totalCollected.toFixed(4),
      totalPaid: totalPaid.toFixed(4),
      netTax: (totalCollected - totalPaid).toFixed(4),
      partial: { collected: !canSales, paid: !canPurch },
    },
  });
});

/** Posted sales by salesperson (invoice header). */
reportsRouter.get('/sales-by-salesperson', requirePermission('reports.logistics', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);

  const rows = await dataSource.query(
    `
    SELECT
      i.salesperson_id AS "salespersonId",
      COALESCE(sp.name, '(Unassigned)') AS "salespersonName",
      COALESCE(sp.code, '') AS "salespersonCode",
      COUNT(*)::int AS "invoiceCount",
      SUM(i.total::numeric)::text AS "totalValue",
      COALESCE(SUM(q.line_qty), 0)::text AS "totalQuantity"
    FROM invoices i
    LEFT JOIN salespersons sp ON sp.id = i.salesperson_id
    LEFT JOIN LATERAL (
      SELECT SUM(il.quantity::numeric) AS line_qty
      FROM invoice_lines il
      WHERE il.invoice_id = i.id
    ) q ON true
    WHERE i.status = 'posted'
      AND i.deleted_at IS NULL
      AND i.invoice_date >= $1::date
      AND i.invoice_date <= $2::date
      AND ($3::uuid IS NULL OR i.branch_id IS NULL OR i.branch_id = $3::uuid)
    GROUP BY i.salesperson_id, sp.name, sp.code
    ORDER BY SUM(i.total::numeric) DESC NULLS LAST
    `,
    [dateFrom, dateTo, branchId || null]
  );

  let grandTotal = 0;
  let grandQty = 0;
  for (const r of rows) {
    grandTotal += parseFloat(r.totalValue);
    grandQty += parseFloat(r.totalQuantity);
  }

  res.json({
    data: rows,
    meta: {
      dateFrom,
      dateTo,
      grandTotal: grandTotal.toFixed(4),
      grandQuantity: grandQty.toFixed(4),
    },
  });
});

/** Posted sales by customer default delivery route. */
reportsRouter.get('/sales-by-route', requirePermission('reports.logistics', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);

  const rows = await dataSource.query(
    `
    SELECT
      dr.id AS "routeId",
      COALESCE(dr.name, '(No route)') AS "routeName",
      COALESCE(dr.code, '') AS "routeCode",
      COUNT(i.id)::int AS "invoiceCount",
      SUM(i.total::numeric)::text AS "totalValue",
      COALESCE(SUM(q.line_qty), 0)::text AS "totalQuantity"
    FROM invoices i
    INNER JOIN customers c ON c.id = i.customer_id AND c.deleted_at IS NULL
    LEFT JOIN delivery_routes dr ON dr.id = c.default_route_id
    LEFT JOIN LATERAL (
      SELECT SUM(il.quantity::numeric) AS line_qty
      FROM invoice_lines il
      WHERE il.invoice_id = i.id
    ) q ON true
    WHERE i.status = 'posted'
      AND i.deleted_at IS NULL
      AND i.invoice_date >= $1::date
      AND i.invoice_date <= $2::date
      AND ($3::uuid IS NULL OR i.branch_id IS NULL OR i.branch_id = $3::uuid)
    GROUP BY dr.id, dr.name, dr.code
    ORDER BY SUM(i.total::numeric) DESC NULLS LAST
    `,
    [dateFrom, dateTo, branchId || null]
  );

  let grandTotal = 0;
  let grandQty = 0;
  for (const r of rows) {
    grandTotal += parseFloat(r.totalValue);
    grandQty += parseFloat(r.totalQuantity);
  }

  res.json({
    data: rows,
    meta: {
      dateFrom,
      dateTo,
      grandTotal: grandTotal.toFixed(4),
      grandQuantity: grandQty.toFixed(4),
    },
  });
});
