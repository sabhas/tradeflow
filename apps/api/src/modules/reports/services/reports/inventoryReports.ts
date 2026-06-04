import { dataSource } from '@tradeflow/db';

export async function stockMovement(params: {
  dateFrom: string;
  dateTo: string;
  productId?: string | null;
  warehouseId?: string | null;
}) {
  const { dateFrom, dateTo, productId = null, warehouseId = null } = params;

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

  return { data: rows, meta: { dateFrom, dateTo, productId, warehouseId, rowCount: rows.length } };
}

export async function deadStock(params: { asOf: string; daysWithoutSale: number }) {
  const { asOf, daysWithoutSale: days } = params;
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

  return {
    data: rows,
    meta: { asOf, daysWithoutSale: days, lookbackFrom: fromStr, rowCount: rows.length },
  };
}

export async function slowMoving(params: { dateFrom: string; dateTo: string; limit: number }) {
  const { dateFrom, dateTo, limit } = params;

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

  return { data: rows, meta: { dateFrom, dateTo, limit } };
}
