import type { Request } from 'express';
import { dataSource } from '@tradeflow/db';
import { getCompanyAccountingSettings } from '../companySettings';
import { ok, type ControllerResult } from '../../utils/controllerResult';

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
  const dateTo = (req.query.dateTo as string) || new Date().toISOString().slice(0, 10);
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

  const byProfile = [...byKey.values()].sort((a, b) => a.taxProfileName.localeCompare(b.taxProfileName));

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
    WHERE jl.account_id = ANY($3::uuid[])
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
    WHERE jl.account_id = ANY($3::uuid[])
    `,
    [dateFrom, dateTo, [cashId, bankId]]
  );

  return ok({
    data: { byDay, totalNetLiquid: total[0]?.t ?? '0' },
    meta: { dateFrom, dateTo, accountIds: { cashId, bankId } },
  });
}
