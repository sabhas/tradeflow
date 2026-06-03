import type { Request } from 'express';
import { dataSource } from '@tradeflow/db';
import { ok, type ControllerResult } from '../../utils/controllerResult';

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
    LIMIT $3
    `,
    [dateFrom, dateTo, limit]
  );

  return ok({ data: rows, meta: { dateFrom, dateTo, limit } });
}

/** Posted GRNs without a posted supplier invoice, or with invoice total mismatch (audit / follow-up). */
