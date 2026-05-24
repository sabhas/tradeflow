import type { Request } from 'express';
import { dataSource } from '@tradeflow/db';
import { getCompanyAccountingSettings } from '../services/companySettings';
import { ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

function hasPerm(req: Request, code: string): boolean {
  const p = req.auth?.permissions ?? [];
  return p.includes('*') || p.includes(code);
}

/** Posted invoices aggregated by calendar day (operational sales). */
export async function dailySales(req: Request): Promise<ControllerResult> {
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const customerId = (req.query.customerId as string)?.trim() || null;
  const warehouseId = (req.query.warehouseId as string)?.trim() || null;

  const rows = await dataSource.query(
    `
    SELECT
      i.invoice_date::text AS date,
      COUNT(*)::int AS count,
      SUM(
        CASE WHEN i.document_kind = 'credit_note' THEN -i.total::numeric ELSE i.total::numeric END
      )::text AS "totalAmount"
    FROM invoices i
    WHERE i.status = 'posted'
      AND i.deleted_at IS NULL
      AND i.invoice_date >= $1::date
      AND i.invoice_date <= $2::date
      AND ($3::uuid IS NULL OR i.customer_id = $3::uuid)
      AND ($4::uuid IS NULL OR i.warehouse_id = $4::uuid)
    GROUP BY i.invoice_date
    ORDER BY i.invoice_date
    `,
    [dateFrom, dateTo, customerId, warehouseId]
  );

  let grandTotal = 0;
  let invoiceCount = 0;
  for (const r of rows) {
    grandTotal += parseFloat(r.totalAmount);
    invoiceCount += Number(r.count);
  }

  return ok({
    data: rows,
    meta: { dateFrom, dateTo, customerId, warehouseId, grandTotal: grandTotal.toFixed(4), invoiceCount },
  });
}

/** Inventory movements in period with optional product / warehouse filters. */
export async function stockMovement(req: Request): Promise<ControllerResult> {
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
    ORDER BY im.movement_date, im.created_at, im.id
    `,
    [dateFrom, dateTo, productId, warehouseId]
  );

  return ok({ data: rows, meta: { dateFrom, dateTo, productId, warehouseId, rowCount: rows.length } });
}

/** Products ranked by quantity or line value sold in period (posted invoices). */
export async function fastMoving(req: Request): Promise<ControllerResult> {
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const rawLimit = parseInt(String(req.query.limit || '50'), 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 50;
  const sortBy = (req.query.sortBy as string) === 'value' ? 'value' : 'quantity';

  const orderSql =
    sortBy === 'value'
      ? 'SUM(CASE WHEN i.document_kind = \'credit_note\' THEN -(il.quantity::numeric * il.unit_price::numeric - il.discount_amount::numeric) ELSE (il.quantity::numeric * il.unit_price::numeric - il.discount_amount::numeric) END) DESC NULLS LAST'
      : 'SUM(il.quantity::numeric) DESC NULLS LAST';

  const rows = await dataSource.query(
    `
    SELECT
      il.product_id AS "productId",
      p.sku AS "productSku",
      p.name AS "productName",
      SUM(
        CASE WHEN i.document_kind = 'credit_note' THEN -il.quantity::numeric ELSE il.quantity::numeric END
      )::text AS "quantitySold",
      SUM(
        CASE
          WHEN i.document_kind = 'credit_note' THEN
            -(il.quantity::numeric * il.unit_price::numeric - il.discount_amount::numeric)
          ELSE (il.quantity::numeric * il.unit_price::numeric - il.discount_amount::numeric)
        END
      )::text AS "lineValue"
    FROM invoice_lines il
    INNER JOIN invoices i ON i.id = il.invoice_id AND i.deleted_at IS NULL
    INNER JOIN products p ON p.id = il.product_id AND p.deleted_at IS NULL
    WHERE i.status = 'posted'
      AND i.invoice_date >= $1::date
      AND i.invoice_date <= $2::date
    GROUP BY il.product_id, p.sku, p.name
    ORDER BY ${orderSql}
    LIMIT $4
    `,
    [dateFrom, dateTo, limit]
  );

  return ok({ data: rows, meta: { dateFrom, dateTo, limit, sortBy } });
}

/** Expense accounts with period activity (P&amp;L expense slice). */
export async function expenseAnalysis(req: Request): Promise<ControllerResult> {
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
    WHERE a.type = 'expense'
    GROUP BY a.id, a.code, a.name
    HAVING COALESCE(SUM(jl.debit), 0) != 0 OR COALESCE(SUM(jl.credit), 0) != 0
    ORDER BY a.code
    `,
    [dateFrom, dateTo]
  );

  let totalNet = 0;
  for (const r of rows) {
    totalNet += parseFloat(r.netExpense);
  }

  return ok({
    data: rows,
    meta: { dateFrom, dateTo, totalNetExpense: totalNet.toFixed(4) },
  });
}

export async function receivablesAging(req: Request): Promise<ControllerResult> {
  const asOf = ((req.query.asOf as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
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
      (CASE WHEN i.document_kind = 'credit_note' THEN -i.total::numeric ELSE i.total::numeric END - COALESCE((
        SELECT SUM(ra.amount)
        FROM receipt_allocations ra
        WHERE ra.invoice_id = i.id
      ), 0))::text AS "openAmount"
    FROM invoices i
    INNER JOIN customers c ON c.id = i.customer_id AND c.deleted_at IS NULL
    WHERE i.status = 'posted'
      AND i.deleted_at IS NULL
      AND i.payment_type = 'credit'
    `
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

  return ok({ data, meta: { asOf } });
}

/** Payables aging by supplier (posted supplier invoices with open balance). */
export async function payablesAging(req: Request): Promise<ControllerResult> {
  const asOf = ((req.query.asOf as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
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
    `
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

  return ok({ data, meta: { asOf } });
}

/** Posted journal activity by account for date range (trial balance). */
export async function trialBalance(req: Request): Promise<ControllerResult> {
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
    GROUP BY a.id, a.code, a.name, a.type
    HAVING COALESCE(SUM(jl.debit), 0) != 0 OR COALESCE(SUM(jl.credit), 0) != 0
    ORDER BY a.code
    `,
    [dateFrom, dateTo]
  );

  let totalDebit = 0;
  let totalCredit = 0;
  for (const r of rows) {
    totalDebit += parseFloat(r.debit);
    totalCredit += parseFloat(r.credit);
  }

  return ok({
    data: rows,
    meta: { dateFrom, dateTo, totalDebit: totalDebit.toFixed(4), totalCredit: totalCredit.toFixed(4) },
  });
}

/** Profit & loss: income and expense accounts for period. */
export async function profitLoss(req: Request): Promise<ControllerResult> {
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
    WHERE a.type IN ('income', 'expense')
    GROUP BY a.id, a.code, a.name, a.type
    HAVING COALESCE(SUM(jl.debit), 0) != 0 OR COALESCE(SUM(jl.credit), 0) != 0
    ORDER BY a.type DESC, a.code
    `,
    [dateFrom, dateTo]
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

  return ok({
    data: rows,
    meta: {
      dateFrom,
      dateTo,
      incomeNet: incomeNet.toFixed(4),
      expenseNet: expenseNet.toFixed(4),
      netProfit: netProfit.toFixed(4),
    },
  });
}

/** Balance sheet: assets, liabilities, equity as of date (cumulative posted journals). */
export async function balanceSheet(req: Request): Promise<ControllerResult> {
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
    WHERE a.type IN ('asset', 'liability', 'equity')
    GROUP BY a.id, a.code, a.name, a.type
    HAVING COALESCE(SUM(jl.debit), 0) != 0 OR COALESCE(SUM(jl.credit), 0) != 0
    ORDER BY a.type, a.code
    `,
    [asOfDate]
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

  return ok({
    data: rows,
    meta: {
      asOfDate,
      totalAssets: assets.toFixed(4),
      totalLiabilities: liabilities.toFixed(4),
      totalEquity: equity.toFixed(4),
      liabilitiesPlusEquity: (liabilities + equity).toFixed(4),
    },
  });
}

/** Posted sales invoice lines with tax (audit trail). */
export async function taxCollected(req: Request): Promise<ControllerResult> {
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
    ORDER BY i.invoice_date, i.id, il.id
    `,
    [dateFrom, dateTo, taxProfileId]
  );

  let totalTax = 0;
  for (const r of rows) {
    totalTax += parseFloat(r.taxAmount);
  }

  return ok({
    data: rows,
    meta: { dateFrom, dateTo, taxProfileId, totalTax: totalTax.toFixed(4) },
  });
}

/** Posted supplier invoice lines with tax (audit trail). */
export async function taxPaid(req: Request): Promise<ControllerResult> {
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
    ORDER BY si.invoice_date, si.id, sil.id
    `,
    [dateFrom, dateTo, taxProfileId]
  );

  let totalTax = 0;
  for (const r of rows) {
    totalTax += parseFloat(r.taxAmount);
  }

  return ok({
    data: rows,
    meta: { dateFrom, dateTo, taxProfileId, totalTax: totalTax.toFixed(4) },
  });
}

/** Collected vs paid tax by tax profile (respects caller permissions per side). */
export async function taxSummary(req: Request): Promise<ControllerResult> {
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
      GROUP BY il.tax_profile_id, tp.name, tp.rate, tp.is_inclusive
      ORDER BY "taxProfileName"
      `,
      [dateFrom, dateTo]
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
      GROUP BY sil.tax_profile_id, tp.name, tp.rate, tp.is_inclusive
      ORDER BY "taxProfileName"
      `,
      [dateFrom, dateTo]
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
       AND i.invoice_date >= $1::date AND i.invoice_date <= $2::date`,
      [dateFrom, dateTo]
    );
    collectedInvoiceCount = cnt[0]?.c ?? '0';
  }
  if (canPurch) {
    const cnt = await dataSource.query(
      `SELECT COUNT(DISTINCT si.id)::text AS c FROM supplier_invoices si
       WHERE si.status = 'posted' AND si.invoice_date >= $1::date AND si.invoice_date <= $2::date`,
      [dateFrom, dateTo]
    );
    paidInvoiceCount = cnt[0]?.c ?? '0';
  }

  return ok({
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
}

/** On-hand stock with no sales in the lookback window (dead stock). */
export async function deadStock(req: Request): Promise<ControllerResult> {
  const asOf = ((req.query.asOf as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const rawDays = parseInt(String(req.query.daysWithoutSale || '90'), 10);
  const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 3650) : 90;
  const fromDate = new Date(asOf + 'T12:00:00Z');
  fromDate.setUTCDate(fromDate.getUTCDate() - days);
  const fromStr = fromDate.toISOString().slice(0, 10);

  const rows = await dataSource.query(
    `
    SELECT
      sb.product_id AS "productId",
      p.sku AS "productSku",
      p.name AS "productName",
      sb.warehouse_id AS "warehouseId",
      w.name AS "warehouseName",
      w.code AS "warehouseCode",
      sb.quantity::text AS "quantityOnHand"
    FROM stock_balances sb
    INNER JOIN products p ON p.id = sb.product_id AND p.deleted_at IS NULL
    INNER JOIN warehouses w ON w.id = sb.warehouse_id
    WHERE sb.quantity::numeric > 0.00001
      AND NOT EXISTS (
        SELECT 1 FROM inventory_movements im
        WHERE im.product_id = sb.product_id
          AND im.warehouse_id = sb.warehouse_id
          AND im.ref_type = 'sale'
          AND im.movement_date >= $2::date
          AND im.movement_date <= $3::date
      )
    ORDER BY p.name, w.name
    `,
    [null, fromStr, asOf]
  );

  return ok({
    data: rows,
    meta: { asOf, daysWithoutSale: days, lookbackFrom: fromStr, rowCount: rows.length },
  });
}

/** Lowest quantity sold in period (slow movers). */
export async function slowMoving(req: Request): Promise<ControllerResult> {
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const rawLimit = parseInt(String(req.query.limit || '50'), 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 50;

  const rows = await dataSource.query(
    `
    SELECT
      p.id AS "productId",
      p.sku AS "productSku",
      p.name AS "productName",
      COALESCE(SUM(il.quantity::numeric), 0)::text AS "quantitySold"
    FROM products p
    LEFT JOIN invoice_lines il ON il.product_id = p.id
    LEFT JOIN invoices i ON i.id = il.invoice_id
      AND i.deleted_at IS NULL
      AND i.status = 'posted'
      AND i.invoice_date >= $1::date
      AND i.invoice_date <= $2::date
    WHERE p.deleted_at IS NULL
    GROUP BY p.id, p.sku, p.name
    ORDER BY COALESCE(SUM(il.quantity::numeric), 0) ASC NULLS FIRST, p.name ASC
    LIMIT $4
    `,
    [dateFrom, dateTo, limit]
  );

  return ok({ data: rows, meta: { dateFrom, dateTo, limit } });
}

/** Posted GRNs without a posted supplier invoice, or with invoice total mismatch (audit / follow-up). */
export async function grnInvoiceReconciliation(req: Request): Promise<ControllerResult> {
  if (!hasPerm(req, 'purchases.reports:read') && !hasPerm(req, 'purchases.grn:read')) {
    throw new HttpError(403, {
      error: 'Forbidden',
      message: 'purchases.reports:read or purchases.grn:read required',
    });
  }
  const asOf = ((req.query.asOf as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);

  const rows = await dataSource.query(
    `
    SELECT
      g.id AS "grnId",
      g.grn_date::text AS "grnDate",
      g.supplier_id AS "supplierId",
      s.name AS "supplierName",
      (
        SELECT COALESCE(SUM(gl.quantity::numeric * gl.unit_price::numeric), 0)::text
        FROM grn_lines gl
        WHERE gl.grn_id = g.id
      ) AS "grnTotal",
      COALESCE((
        SELECT SUM(jl.credit::numeric)::text
        FROM journal_entries je
        JOIN journal_lines jl ON jl.journal_entry_id = je.id
        JOIN accounts a ON a.id = jl.account_id
        WHERE je.source_type = 'grn_posting'
          AND je.source_id = g.id
          AND je.status = 'posted'
          AND a.code = '2050'
      ), '0.0000') AS "accruedAmount",
      si.id AS "supplierInvoiceId",
      si.invoice_number AS "supplierInvoiceNumber",
      si.status AS "supplierInvoiceStatus",
      si.total::text AS "invoiceTotal",
      CASE
        WHEN si.id IS NULL THEN 'awaiting_invoice'
        WHEN si.status = 'draft' THEN 'invoice_draft'
        WHEN si.status = 'posted' THEN 'invoice_posted'
        ELSE 'unknown'
      END AS "invoiceSettlement",
      CASE
        WHEN si.id IS NULL THEN NULL
        ELSE (
          si.total::numeric - (
            SELECT COALESCE(SUM(gl.quantity::numeric * gl.unit_price::numeric), 0)
            FROM grn_lines gl
            WHERE gl.grn_id = g.id
          )
        )::text
      END AS "variance"
    FROM grns g
    JOIN suppliers s ON s.id = g.supplier_id
    LEFT JOIN LATERAL (
      SELECT si2.*
      FROM supplier_invoices si2
      WHERE si2.grn_id = g.id
      ORDER BY si2.created_at DESC
      LIMIT 1
    ) si ON true
    WHERE g.status = 'posted'
      AND g.grn_date <= $1::date
      AND (
        si.id IS NULL
        OR si.status != 'posted'
        OR ABS(
          si.total::numeric - (
            SELECT COALESCE(SUM(gl.quantity::numeric * gl.unit_price::numeric), 0)
            FROM grn_lines gl
            WHERE gl.grn_id = g.id
          )
        ) > 0.01
      )
    ORDER BY g.grn_date DESC, g.created_at DESC
    `,
    [asOf]
  );

  return ok({ data: rows, meta: { asOf } });
}

/** Today / MTD sales & purchases, AR/AP open, quick aging totals (branch-scoped). */
export async function dashboardKpis(req: Request): Promise<ControllerResult> {
    const canSales = hasPerm(req, 'sales:read');
    const canPurch = hasPerm(req, 'purchases.reports:read');
    const canGrn = hasPerm(req, 'purchases.grn:read');
    if (!canSales && !canPurch && !canGrn) {
      throw new HttpError(403, { error: 'Forbidden', message: 'sales:read or purchases.reports:read required' });
    }
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01`;
    let salesToday = '0.0000';
    let salesMtd = '0.0000';
    let purchasesToday = '0.0000';
    let purchasesMtd = '0.0000';
    let invoicesPostedToday = 0;

    if (canSales) {
      const s1 = await dataSource.query(
        `
        SELECT COALESCE(SUM(i.total::numeric), 0)::text AS t, COUNT(*)::int AS c
        FROM invoices i
        WHERE i.status = 'posted' AND i.deleted_at IS NULL
          AND i.invoice_date = $1::date
        `,
        [today]
      );
      salesToday = s1[0]?.t ?? '0';
      invoicesPostedToday = Number(s1[0]?.c ?? 0);
      const s2 = await dataSource.query(
        `
        SELECT COALESCE(SUM(i.total::numeric), 0)::text AS t
        FROM invoices i
        WHERE i.status = 'posted' AND i.deleted_at IS NULL
          AND i.invoice_date >= $1::date AND i.invoice_date <= $2::date
        `,
        [monthStart, today]
      );
      salesMtd = s2[0]?.t ?? '0';
    }

    if (canPurch) {
      const p1 = await dataSource.query(
        `
        SELECT COALESCE(SUM(si.total::numeric), 0)::text AS t
        FROM supplier_invoices si
        WHERE si.status = 'posted'
          AND si.invoice_date = $1::date
        `,
        [today]
      );
      purchasesToday = p1[0]?.t ?? '0';
      const p2 = await dataSource.query(
        `
        SELECT COALESCE(SUM(si.total::numeric), 0)::text AS t
        FROM supplier_invoices si
        WHERE si.status = 'posted'
          AND si.invoice_date >= $1::date AND si.invoice_date <= $2::date
        `,
        [monthStart, today]
      );
      purchasesMtd = p2[0]?.t ?? '0';
    }

    let arOpen = '0.0000';
    let apOpen = '0.0000';
    let agingQuick = {
      arCurrent: '0.0000',
      ar1_30: '0.0000',
      ar31_60: '0.0000',
      ar61_90: '0.0000',
      ar90p: '0.0000',
    };

    if (canSales) {
      const ar = await dataSource.query(
        `
        SELECT COALESCE(SUM(
          i.total::numeric - COALESCE((SELECT SUM(ra.amount) FROM receipt_allocations ra WHERE ra.invoice_id = i.id), 0)
        ), 0)::text AS t
        FROM invoices i
        WHERE i.status = 'posted' AND i.deleted_at IS NULL AND i.payment_type = 'credit'
        `,
        []
      );
      arOpen = ar[0]?.t ?? '0';

      const asOf = today;
      const asOfMs = new Date(`${asOf}T12:00:00.000Z`).getTime();
      const invRows = await dataSource.query(
        `
        SELECT i.due_date AS "dueDate", (i.total::numeric - COALESCE((SELECT SUM(ra.amount) FROM receipt_allocations ra WHERE ra.invoice_id = i.id), 0))::text AS "openAmount"
        FROM invoices i
        WHERE i.status = 'posted' AND i.deleted_at IS NULL AND i.payment_type = 'credit'
        `,
        []
      );
      const b = {
        arCurrent: 0,
        ar1_30: 0,
        ar31_60: 0,
        ar61_90: 0,
        ar90p: 0,
      };
      for (const r of invRows) {
        const open = parseFloat(r.openAmount);
        if (open <= 0.00005) continue;
        const dueMs = new Date(`${r.dueDate}T12:00:00.000Z`).getTime();
        const daysPast = Math.floor((asOfMs - dueMs) / (24 * 3600 * 1000));
        if (daysPast < 1) b.arCurrent += open;
        else if (daysPast <= 30) b.ar1_30 += open;
        else if (daysPast <= 60) b.ar31_60 += open;
        else if (daysPast <= 90) b.ar61_90 += open;
        else b.ar90p += open;
      }
      agingQuick = {
        arCurrent: b.arCurrent.toFixed(4),
        ar1_30: b.ar1_30.toFixed(4),
        ar31_60: b.ar31_60.toFixed(4),
        ar61_90: b.ar61_90.toFixed(4),
        ar90p: b.ar90p.toFixed(4),
      };
    }

    let grnsPendingSupplierInvoice = 0;
    if (canPurch || canGrn) {
      const grnPending = await dataSource.query(
        `
        SELECT COUNT(*)::int AS c
        FROM grns g
        WHERE g.status = 'posted'
          AND (
            NOT EXISTS (SELECT 1 FROM supplier_invoices si WHERE si.grn_id = g.id)
            OR EXISTS (SELECT 1 FROM supplier_invoices si WHERE si.grn_id = g.id AND si.status = 'draft')
          )
        `,
        []
      );
      grnsPendingSupplierInvoice = Number(grnPending[0]?.c ?? 0);
    }

    if (canPurch) {
      const ap = await dataSource.query(
        `
        SELECT COALESCE(SUM(
          si.total::numeric - COALESCE((SELECT SUM(spa.amount) FROM supplier_payment_allocations spa WHERE spa.supplier_invoice_id = si.id), 0)
        ), 0)::text AS t
        FROM supplier_invoices si
        WHERE si.status = 'posted'
        `,
        []
      );
      apOpen = ap[0]?.t ?? '0';
    }

    return ok({
      data: {
        asOfDate: today,
        monthStart,
        salesToday,
        salesMtd,
        purchasesToday,
        purchasesMtd,
        invoicesPostedToday,
        arOpen,
        apOpen,
        agingReceivables: agingQuick,
        grnsPendingSupplierInvoice,
      },
      meta: {
        partial: { sales: !canSales, purchases: !canPurch && !canGrn },
      },
    });
}

/** Posted supplier purchases vs posted sales totals for a range. */
export async function purchaseVsSales(req: Request): Promise<ControllerResult> {
  const canPurch = hasPerm(req, 'purchases.reports:read');
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const sales = await dataSource.query(
    `
    SELECT COALESCE(SUM(i.total::numeric), 0)::text AS t, COUNT(*)::int AS c
    FROM invoices i
    WHERE i.status = 'posted' AND i.deleted_at IS NULL
      AND i.invoice_date >= $1::date AND i.invoice_date <= $2::date
    `,
    [dateFrom, dateTo]
  );

  let purchasesTotal = '0.0000';
  let purchaseCount = 0;
  if (canPurch) {
    const p = await dataSource.query(
      `
      SELECT COALESCE(SUM(si.total::numeric), 0)::text AS t, COUNT(*)::int AS c
      FROM supplier_invoices si
      WHERE si.status = 'posted'
        AND si.invoice_date >= $1::date AND si.invoice_date <= $2::date
      `,
      [dateFrom, dateTo]
    );
    purchasesTotal = p[0]?.t ?? '0';
    purchaseCount = Number(p[0]?.c ?? 0);
  }

  return ok({
    data: {
      salesTotal: sales[0]?.t ?? '0',
      salesInvoiceCount: Number(sales[0]?.c ?? 0),
      purchasesTotal,
      purchaseInvoiceCount: purchaseCount,
      netSalesMinusPurchases: (
        parseFloat(sales[0]?.t ?? '0') - parseFloat(purchasesTotal)
      ).toFixed(4),
    },
    meta: { dateFrom, dateTo, purchasesHidden: !canPurch },
  });
}

/** Layer COGS vs line revenue by product (posted sales in range). */
export async function profitByProduct(req: Request): Promise<ControllerResult> {
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const rows = await dataSource.query(
    `
    WITH rev AS (
      SELECT il.product_id AS pid,
        SUM(il.quantity::numeric * il.unit_price::numeric - il.discount_amount::numeric)::numeric AS revenue
      FROM invoice_lines il
      INNER JOIN invoices i ON i.id = il.invoice_id AND i.deleted_at IS NULL
      WHERE i.status = 'posted'
        AND i.invoice_date >= $1::date AND i.invoice_date <= $2::date
      GROUP BY il.product_id
    ),
    cog AS (
      SELECT im.product_id AS pid,
        SUM(ABS(im.quantity_delta::numeric) * COALESCE(im.unit_cost::numeric, 0))::numeric AS cogs
      FROM inventory_movements im
      WHERE im.ref_type = 'sale'
        AND im.movement_date >= $1::date AND im.movement_date <= $2::date
      GROUP BY im.product_id
    )
    SELECT
      p.id AS "productId",
      p.sku AS "productSku",
      p.name AS "productName",
      COALESCE(rev.revenue, 0)::text AS revenue,
      COALESCE(cog.cogs, 0)::text AS cogs,
      (COALESCE(rev.revenue, 0) - COALESCE(cog.cogs, 0))::text AS profit
    FROM products p
    LEFT JOIN rev ON rev.pid = p.id
    LEFT JOIN cog ON cog.pid = p.id
    WHERE p.deleted_at IS NULL
      AND (COALESCE(rev.revenue, 0) > 0.00001 OR COALESCE(cog.cogs, 0) > 0.00001)
    ORDER BY (COALESCE(rev.revenue, 0) - COALESCE(cog.cogs, 0)) DESC NULLS LAST
    `,
    [dateFrom, dateTo]
  );

  return ok({ data: rows, meta: { dateFrom, dateTo } });
}

/** Layer COGS vs revenue by customer. */
export async function profitByCustomer(req: Request): Promise<ControllerResult> {
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const rows = await dataSource.query(
    `
    WITH rev AS (
      SELECT i.customer_id AS cid,
        SUM(il.quantity::numeric * il.unit_price::numeric - il.discount_amount::numeric)::numeric AS revenue
      FROM invoice_lines il
      INNER JOIN invoices i ON i.id = il.invoice_id AND i.deleted_at IS NULL
      WHERE i.status = 'posted'
        AND i.invoice_date >= $1::date AND i.invoice_date <= $2::date
      GROUP BY i.customer_id
    ),
    cog AS (
      SELECT i.customer_id AS cid,
        SUM(ABS(im.quantity_delta::numeric) * COALESCE(im.unit_cost::numeric, 0))::numeric AS cogs
      FROM inventory_movements im
      INNER JOIN invoices i ON i.id = im.ref_id AND i.deleted_at IS NULL
      WHERE im.ref_type = 'sale'
        AND i.status = 'posted'
        AND i.invoice_date >= $1::date AND i.invoice_date <= $2::date
      GROUP BY i.customer_id
    )
    SELECT
      c.id AS "customerId",
      c.name AS "customerName",
      COALESCE(rev.revenue, 0)::text AS revenue,
      COALESCE(cog.cogs, 0)::text AS cogs,
      (COALESCE(rev.revenue, 0) - COALESCE(cog.cogs, 0))::text AS profit
    FROM customers c
    LEFT JOIN rev ON rev.cid = c.id
    LEFT JOIN cog ON cog.cid = c.id
    WHERE c.deleted_at IS NULL
      AND (COALESCE(rev.revenue, 0) > 0.00001 OR COALESCE(cog.cogs, 0) > 0.00001)
    ORDER BY (COALESCE(rev.revenue, 0) - COALESCE(cog.cogs, 0)) DESC NULLS LAST
    `,
    [dateFrom, dateTo]
  );

  return ok({ data: rows, meta: { dateFrom, dateTo } });
}

/** Net change on default cash & bank GL accounts (posted journals). */
export async function cashFlow(req: Request): Promise<ControllerResult> {
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const { cashId, bankId } = await getCompanyAccountingSettings(dataSource.manager);

  const byDay = await dataSource.query(
    `
    SELECT
      je.entry_date::text AS date,
      COALESCE(SUM(jl.debit::numeric - jl.credit::numeric), 0)::text AS "netChange"
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      AND je.deleted_at IS NULL
      AND je.status = 'posted'
      AND je.entry_date >= $1::date
      AND je.entry_date <= $2::date
    WHERE jl.account_id = ANY($4::uuid[])
    GROUP BY je.entry_date
    ORDER BY je.entry_date
    `,
    [dateFrom, dateTo, [cashId, bankId]]
  );

  const total = await dataSource.query(
    `
    SELECT COALESCE(SUM(jl.debit::numeric - jl.credit::numeric), 0)::text AS t
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      AND je.deleted_at IS NULL
      AND je.status = 'posted'
      AND je.entry_date >= $1::date
      AND je.entry_date <= $2::date
    WHERE jl.account_id = ANY($4::uuid[])
    `,
    [dateFrom, dateTo, [cashId, bankId]]
  );

  return ok({
    data: { byDay, totalNetLiquid: total[0]?.t ?? '0' },
    meta: { dateFrom, dateTo, accountIds: { cashId, bankId } },
  });
}
