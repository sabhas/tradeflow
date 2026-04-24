import type { Request } from 'express';
import { In } from 'typeorm';
import { dataSource, InventoryMovement, StockBalance } from '@tradeflow/db';
import type { z } from 'zod';
import { postOpeningBalanceSchema, postStockAdjustmentSchema } from '@tradeflow/shared';
import { getPagination } from '../utils/pagination';
import {
  applyMovement,
  assertProductInScope,
  assertWarehouseInScope,
  newBatchRefId,
  runInTransaction,
} from '../services/inventoryService';
import { parseDecimalStrict } from '../utils/decimal';
import { created, ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

type PostOpeningBalanceInput = z.infer<typeof postOpeningBalanceSchema>;
type PostStockAdjustmentInput = z.infer<typeof postStockAdjustmentSchema>;

function formatMovementDate(d: unknown): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  if (typeof d === 'string') return d.slice(0, 10);
  return String(d);
}

function serializeMovement(m: InventoryMovement) {
  return {
    id: m.id,
    productId: m.productId,
    warehouseId: m.warehouseId,
    quantityDelta: m.quantityDelta,
    refType: m.refType,
    refId: m.refId,
    grnLineId: m.grnLineId ?? null,
    invoiceLineId: m.invoiceLineId ?? null,
    stockTransferLineId: m.stockTransferLineId ?? null,
    unitCost: m.unitCost,
    movementDate: formatMovementDate(m.movementDate),
    notes: m.notes,
    userId: m.userId,
    createdAt: m.createdAt,
    product: m.product
      ? { id: m.product.id, sku: m.product.sku, name: m.product.name, costPrice: m.product.costPrice }
      : undefined,
    warehouse: m.warehouse ? { id: m.warehouse.id, name: m.warehouse.name, code: m.warehouse.code } : undefined,
  };
}

function serializeBalance(sb: StockBalance) {
  const cost = sb.product?.costPrice;
  const qty = sb.quantity;
  const value =
    cost !== undefined && cost !== null && sb.product
      ? (parseFloat(qty) * parseFloat(String(cost))).toFixed(4)
      : undefined;
  return {
    id: sb.id,
    productId: sb.productId,
    warehouseId: sb.warehouseId,
    quantity: sb.quantity,
    updatedAt: sb.updatedAt,
    product: sb.product
      ? {
          id: sb.product.id,
          sku: sb.product.sku,
          name: sb.product.name,
          costPrice: sb.product.costPrice,
          tradePrice: sb.product.sellingPrice,
          retailPrice: sb.product.retailPrice,
        }
      : undefined,
    warehouse: sb.warehouse ? { id: sb.warehouse.id, name: sb.warehouse.name, code: sb.warehouse.code } : undefined,
    valueAtCost: value,
  };
}

export async function listBalances(req: Request): Promise<ControllerResult> {
  const warehouseId = req.query.warehouseId as string | undefined;
  const productId = req.query.productId as string | undefined;

  const qb = StockBalance
    .createQueryBuilder('sb')
    .leftJoinAndSelect('sb.product', 'p')
    .leftJoinAndSelect('sb.warehouse', 'w')
    .where('p.deleted_at IS NULL');

  if (warehouseId) {
    qb.andWhere('sb.warehouse_id = :wid', { wid: warehouseId });
  }
  if (productId) {
    qb.andWhere('sb.product_id = :pid', { pid: productId });
  }

  qb.orderBy('p.name', 'ASC').addOrderBy('w.name', 'ASC');

  const rows = await qb.getMany();
  if (rows.length === 0) {
    return ok({ data: [] });
  }
  const pairs = rows.map((r) => ({ pid: r.productId, wid: r.warehouseId }));
  const layerVals = await dataSource.query(
    `
    SELECT product_id AS "productId", warehouse_id AS "warehouseId",
      COALESCE(SUM(quantity_remaining::numeric * unit_cost::numeric), 0)::text AS "valueAtLayers"
    FROM stock_layers
    WHERE (product_id, warehouse_id) IN (${pairs.map((_, i) => `($${i * 2 + 1}::uuid, $${i * 2 + 2}::uuid)`).join(', ')})
    GROUP BY product_id, warehouse_id
    `,
    pairs.flatMap((p) => [p.pid, p.wid])
  );
  const vmap = new Map<string, string>();
  for (const v of layerVals) {
    vmap.set(`${v.productId}|${v.warehouseId}`, v.valueAtLayers);
  }
  return ok({
    data: rows.map((sb) => {
      const s = serializeBalance(sb);
      const lv = vmap.get(`${sb.productId}|${sb.warehouseId}`);
      return { ...s, valueAtLayers: lv ?? '0.0000' };
    }),
  });
}

export async function listBatchBalances(req: Request): Promise<ControllerResult> {
  const warehouseId = req.query.warehouseId as string | undefined;
  const productId = req.query.productId as string | undefined;
  const batchQuery = ((req.query.batch as string | undefined) ?? '').trim();
  const expiryBefore = (req.query.expiryBefore as string | undefined)?.trim();

  const where: string[] = ['l.quantity_remaining::numeric > 0', 'p.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (warehouseId) {
    params.push(warehouseId);
    where.push(`l.warehouse_id = $${params.length}::uuid`);
  }
  if (productId) {
    params.push(productId);
    where.push(`l.product_id = $${params.length}::uuid`);
  }
  if (batchQuery) {
    params.push(`%${batchQuery}%`);
    where.push(`COALESCE(l.batch_code, '') ILIKE $${params.length}`);
  }
  if (expiryBefore) {
    params.push(expiryBefore);
    where.push(`l.expiry_date IS NOT NULL AND l.expiry_date <= $${params.length}::date`);
  }

  const rows = await dataSource.query(
    `
    SELECT
      l.product_id AS "productId",
      p.sku AS "productSku",
      p.name AS "productName",
      l.warehouse_id AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      COALESCE(NULLIF(l.batch_code, ''), 'Unspecified') AS "batchCode",
      l.expiry_date::text AS "expiryDate",
      SUM(l.quantity_remaining::numeric)::text AS "quantity",
      SUM(l.quantity_remaining::numeric * l.unit_cost::numeric)::text AS "valueAtLayers",
      COALESCE(
        (
          SUM(COALESCE(l.trade_price::numeric, p.selling_price::numeric) * l.quantity_remaining::numeric)
          / NULLIF(SUM(l.quantity_remaining::numeric), 0)
        )::text,
        MAX(p.selling_price)::text
      ) AS "tradePrice",
      COALESCE(
        (
          SUM(COALESCE(l.retail_price::numeric, p.retail_price::numeric) * l.quantity_remaining::numeric)
          / NULLIF(SUM(l.quantity_remaining::numeric), 0)
        )::text,
        MAX(p.retail_price)::text
      ) AS "retailPrice",
      COUNT(*)::int AS "layerCount",
      MIN(l.received_at)::text AS "oldestReceivedAt",
      MAX(l.received_at)::text AS "latestReceivedAt"
    FROM stock_layers l
    INNER JOIN products p ON p.id = l.product_id
    INNER JOIN warehouses w ON w.id = l.warehouse_id
    WHERE ${where.join(' AND ')}
    GROUP BY l.product_id, p.sku, p.name, l.warehouse_id, w.code, w.name, COALESCE(NULLIF(l.batch_code, ''), 'Unspecified'), l.expiry_date
    ORDER BY p.name ASC, w.name ASC, l.expiry_date ASC NULLS LAST, COALESCE(NULLIF(l.batch_code, ''), 'Unspecified') ASC
    `,
    params
  );

  return ok({ data: rows, meta: { rowCount: rows.length } });
}

export async function listLowStock(req: Request): Promise<ControllerResult> {
  const rows = await dataSource.query(
    `
    SELECT
      sb.product_id AS "productId",
      p.sku AS "productSku",
      p.name AS "productName",
      sb.warehouse_id AS "warehouseId",
      w.name AS "warehouseName",
      w.code AS "warehouseCode",
      sb.quantity::text AS "quantityOnHand",
      p.min_stock::text AS "minStock",
      p.reorder_level::text AS "reorderLevel"
    FROM stock_balances sb
    INNER JOIN products p ON p.id = sb.product_id AND p.deleted_at IS NULL
    INNER JOIN warehouses w ON w.id = sb.warehouse_id
    WHERE (p.min_stock IS NOT NULL OR p.reorder_level IS NOT NULL)
      AND sb.quantity::numeric > 0
      AND (
        (p.min_stock IS NOT NULL AND sb.quantity::numeric < p.min_stock::numeric)
        OR (p.reorder_level IS NOT NULL AND sb.quantity::numeric < p.reorder_level::numeric)
      )
    ORDER BY p.name, w.name
    `,
    [null]
  );
  return ok({ data: rows, meta: { rowCount: rows.length } });
}

export async function listMovements(req: Request): Promise<ControllerResult> {
  const { limit, offset } = getPagination(req);
  const warehouseId = req.query.warehouseId as string | undefined;
  const productId = req.query.productId as string | undefined;
  const refType = req.query.refType as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  const qb = InventoryMovement
    .createQueryBuilder('m')
    .leftJoinAndSelect('m.product', 'p')
    .leftJoinAndSelect('m.warehouse', 'w')
    .where('p.deleted_at IS NULL');

  if (warehouseId) qb.andWhere('m.warehouse_id = :wid', { wid: warehouseId });
  if (productId) qb.andWhere('m.product_id = :pid', { pid: productId });
  if (refType) qb.andWhere('m.ref_type = :rt', { rt: refType });
  if (dateFrom) qb.andWhere('m.movement_date >= :df', { df: dateFrom });
  if (dateTo) qb.andWhere('m.movement_date <= :dt', { dt: dateTo });

  qb.orderBy('m.movement_date', 'DESC').addOrderBy('m.created_at', 'DESC').take(limit).skip(offset);

  const [rows, total] = await qb.getManyAndCount();
  return ok({
    data: rows.map(serializeMovement),
    meta: { total, limit, offset },
  });
}

export async function postOpeningBalance(req: Request, body: PostOpeningBalanceInput): Promise<ControllerResult> {
  const userId = req.auth?.userId;

  try {
    await assertWarehouseInScope(body.warehouseId, undefined);
  } catch (e) {
    throw new HttpError(400, { error: e instanceof Error ? e.message : 'Bad request' });
  }

  const refId = newBatchRefId();
  try {
    const movements = await runInTransaction(async (manager) => {
      const out: Awaited<ReturnType<typeof applyMovement>>[] = [];
      for (const line of body.lines) {
        await assertProductInScope(line.productId, undefined);
        const qty = parseDecimalStrict(line.quantity);
        const mov = await applyMovement(manager, {
          productId: line.productId,
          warehouseId: body.warehouseId,
          quantityDelta: qty,
          refType: 'opening_balance',
          refId,
          unitCost: line.unitCost != null && line.unitCost !== '' ? parseDecimalStrict(String(line.unitCost)) : undefined,
          movementDate: body.movementDate,
          userId,
          batchCode: line.batchCode?.trim() || undefined,
          expiryDate: line.expiryDate?.trim() ? line.expiryDate.slice(0, 10) : undefined,
        });
        out.push(mov);
      }
      return out;
    });

    const loaded = await InventoryMovement.find({
      where: { id: In(movements.map((m) => m.id)) },
      relations: ['product', 'warehouse'],
    });
    const byId = new Map(loaded.map((m) => [m.id, m]));
    const ordered = movements.map((m) => byId.get(m.id) ?? m);

    return created({
      data: {
        refId,
        movementIds: movements.map((m) => m.id),
        movements: ordered.map(serializeMovement),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to post opening balance';
    throw new HttpError(400, { error: msg });
  }
}

export async function postStockAdjustment(req: Request, body: PostStockAdjustmentInput): Promise<ControllerResult> {
  const userId = req.auth?.userId;

  try {
    await assertWarehouseInScope(body.warehouseId, undefined);
  } catch (e) {
    throw new HttpError(400, { error: e instanceof Error ? e.message : 'Bad request' });
  }

  const movementDate = body.movementDate ?? new Date().toISOString().slice(0, 10);
  const refId = newBatchRefId();
  const reasonNote = body.reason.trim();

  try {
    const movements = await runInTransaction(async (manager) => {
      const out: Awaited<ReturnType<typeof applyMovement>>[] = [];
      for (const line of body.lines) {
        await assertProductInScope(line.productId, undefined);
        const delta = parseDecimalStrict(line.quantityDelta);
        const mov = await applyMovement(manager, {
          productId: line.productId,
          warehouseId: body.warehouseId,
          quantityDelta: delta,
          refType: 'adjustment',
          refId,
          movementDate,
          notes: reasonNote,
          userId,
        });
        out.push(mov);
      }
      return out;
    });

    const loaded = await InventoryMovement.find({
      where: { id: In(movements.map((m) => m.id)) },
      relations: ['product', 'warehouse'],
    });
    const byId = new Map(loaded.map((m) => [m.id, m]));
    const ordered = movements.map((m) => byId.get(m.id) ?? m);

    return created({
      data: {
        refId,
        movementIds: movements.map((m) => m.id),
        movements: ordered.map(serializeMovement),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to post adjustment';
    throw new HttpError(400, { error: msg });
  }
}
