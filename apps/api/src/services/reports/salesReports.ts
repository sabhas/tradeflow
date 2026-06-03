import type { Request } from 'express';
import { dataSource } from '@tradeflow/db';
import { ok, type ControllerResult } from '../../utils/controllerResult';

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

export async function fastMoving(req: Request): Promise<ControllerResult> {
  const dateFrom = ((req.query.dateFrom as string) || '1970-01-01').slice(0, 10);
  const dateTo = ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const rawLimit = parseInt(String(req.query.limit || '50'), 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 50;
  const sortBy = (req.query.sortBy as string) === 'value' ? 'value' : 'quantity';

  const orderSql =
    sortBy === 'value'
      ? "SUM(CASE WHEN i.document_kind = 'credit_note' THEN -(il.quantity::numeric * il.unit_price::numeric - il.discount_amount::numeric) ELSE (il.quantity::numeric * il.unit_price::numeric - il.discount_amount::numeric) END) DESC NULLS LAST"
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
    LIMIT $3
    `,
    [dateFrom, dateTo, limit]
  );

  return ok({ data: rows, meta: { dateFrom, dateTo, limit, sortBy } });
}

/** Expense accounts with period activity (P&amp;L expense slice). */

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
  const byCustomer = new Map<string, { customerName: string; buckets: Bucket; totalOpen: number }>();

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
