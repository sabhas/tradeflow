import type { Request } from 'express';
import { dataSource } from '@tradeflow/db';
import { GL_ACCOUNT_CODES } from '../../constants/glAccounts';
import { ok, type ControllerResult } from '../../utils/controllerResult';
import { HttpError } from '../../utils/httpError';
import { hasPerm } from './helpers';

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
          AND a.code = $2
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
    [asOf, GL_ACCOUNT_CODES.ACCRUED_PURCHASES]
  );

  return ok({ data: rows, meta: { asOf } });
}

/** Today / MTD sales & purchases, AR/AP open, quick aging totals (branch-scoped). */

export async function dashboardKpis(req: Request): Promise<ControllerResult> {
  const canSales = hasPerm(req, 'sales:read');
  const canPurch = hasPerm(req, 'purchases.reports:read');
  const canGrn = hasPerm(req, 'purchases.grn:read');
  if (!canSales && !canPurch && !canGrn) {
    throw new HttpError(403, {
      error: 'Forbidden',
      message: 'sales:read or purchases.reports:read required',
    });
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
      netSalesMinusPurchases: (parseFloat(sales[0]?.t ?? '0') - parseFloat(purchasesTotal)).toFixed(4),
    },
    meta: { dateFrom, dateTo, purchasesHidden: !canPurch },
  });
}

/** Layer COGS vs line revenue by product (posted sales in range). */
