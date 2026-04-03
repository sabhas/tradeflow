import { Router } from 'express';
import { In } from 'typeorm';
import {
  dataSource,
  InventoryMovement,
  StockBalance,
} from '@tradeflow/db';
import { postOpeningBalanceSchema, postStockAdjustmentSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';
import {
  applyMovement,
  assertProductInScope,
  assertWarehouseInScope,
  newBatchRefId,
  runInTransaction,
} from '../services/inventoryService';
import { parseDecimalStrict } from '../utils/decimal';

export const inventoryRouter = Router();
inventoryRouter.use(authMiddleware, loadUser);

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
    branchId: m.branchId,
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
        }
      : undefined,
    warehouse: sb.warehouse ? { id: sb.warehouse.id, name: sb.warehouse.name, code: sb.warehouse.code } : undefined,
    valueAtCost: value,
  };
}

inventoryRouter.get('/balances', requirePermission('inventory', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const warehouseId = req.query.warehouseId as string | undefined;
  const productId = req.query.productId as string | undefined;

  const qb = dataSource
    .getRepository(StockBalance)
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
  if (branchId) {
    qb.andWhere('(w.branch_id IS NULL OR w.branch_id = :bid)', { bid: branchId });
    qb.andWhere('(p.branch_id IS NULL OR p.branch_id = :bid)', { bid: branchId });
  }

  qb.orderBy('p.name', 'ASC').addOrderBy('w.name', 'ASC');

  const rows = await qb.getMany();
  if (rows.length === 0) {
    res.json({ data: [] });
    return;
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
  res.json({
    data: rows.map((sb) => {
      const s = serializeBalance(sb);
      const lv = vmap.get(`${sb.productId}|${sb.warehouseId}`);
      return { ...s, valueAtLayers: lv ?? '0.0000' };
    }),
  });
});

inventoryRouter.get('/balances/low-stock', requirePermission('inventory', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
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
      AND ($1::uuid IS NULL OR p.branch_id IS NULL OR p.branch_id = $1::uuid)
      AND ($1::uuid IS NULL OR w.branch_id IS NULL OR w.branch_id = $1::uuid)
    ORDER BY p.name, w.name
    `,
    [branchId || null]
  );
  res.json({ data: rows, meta: { rowCount: rows.length } });
});

inventoryRouter.get('/movements', requirePermission('inventory', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const { limit, offset } = getPagination(req);
  const warehouseId = req.query.warehouseId as string | undefined;
  const productId = req.query.productId as string | undefined;
  const refType = req.query.refType as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  const qb = dataSource
    .getRepository(InventoryMovement)
    .createQueryBuilder('m')
    .leftJoinAndSelect('m.product', 'p')
    .leftJoinAndSelect('m.warehouse', 'w')
    .where('p.deleted_at IS NULL');

  if (warehouseId) qb.andWhere('m.warehouse_id = :wid', { wid: warehouseId });
  if (productId) qb.andWhere('m.product_id = :pid', { pid: productId });
  if (refType) qb.andWhere('m.ref_type = :rt', { rt: refType });
  if (dateFrom) qb.andWhere('m.movement_date >= :df', { df: dateFrom });
  if (dateTo) qb.andWhere('m.movement_date <= :dt', { dt: dateTo });
  if (branchId) {
    qb.andWhere('(w.branch_id IS NULL OR w.branch_id = :bid)', { bid: branchId });
    qb.andWhere('(p.branch_id IS NULL OR p.branch_id = :bid)', { bid: branchId });
  }

  qb.orderBy('m.movement_date', 'DESC').addOrderBy('m.created_at', 'DESC').take(limit).skip(offset);

  const [rows, total] = await qb.getManyAndCount();
  res.json({
    data: rows.map(serializeMovement),
    meta: { total, limit, offset },
  });
});

inventoryRouter.post(
  '/opening-balance',
  requirePermission('inventory', 'write'),
  auditMiddleware({
    entity: 'InventoryOpeningBalance',
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = postOpeningBalanceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const body = parsed.data;
    const branchId = req.user?.branchId ?? undefined;
    const userId = req.auth?.userId;

    try {
      await assertWarehouseInScope(body.warehouseId, branchId);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Bad request' });
      return;
    }

    const refId = newBatchRefId();
    try {
      const movements = await runInTransaction(async (manager) => {
        const out: Awaited<ReturnType<typeof applyMovement>>[] = [];
        for (const line of body.lines) {
          await assertProductInScope(line.productId, branchId);
          const qty = parseDecimalStrict(line.quantity);
          const mov = await applyMovement(manager, {
            productId: line.productId,
            warehouseId: body.warehouseId,
            quantityDelta: qty,
            refType: 'opening_balance',
            refId,
            unitCost: line.unitCost != null && line.unitCost !== '' ? parseDecimalStrict(String(line.unitCost)) : undefined,
            movementDate: body.movementDate,
            branchId,
            userId,
            batchCode: line.batchCode?.trim() || undefined,
            expiryDate: line.expiryDate?.trim() ? line.expiryDate.slice(0, 10) : undefined,
          });
          out.push(mov);
        }
        return out;
      });

      const loaded = await dataSource.getRepository(InventoryMovement).find({
        where: { id: In(movements.map((m) => m.id)) },
        relations: ['product', 'warehouse'],
      });
      const byId = new Map(loaded.map((m) => [m.id, m]));
      const ordered = movements.map((m) => byId.get(m.id) ?? m);

      res.status(201).json({
        data: {
          refId,
          movementIds: movements.map((m) => m.id),
          movements: ordered.map(serializeMovement),
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to post opening balance';
      res.status(400).json({ error: msg });
    }
  }
);

inventoryRouter.post(
  '/adjustment',
  requirePermission('inventory', 'write'),
  auditMiddleware({
    entity: 'StockAdjustment',
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = postStockAdjustmentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const body = parsed.data;
    const branchId = req.user?.branchId ?? undefined;
    const userId = req.auth?.userId;

    try {
      await assertWarehouseInScope(body.warehouseId, branchId);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Bad request' });
      return;
    }

    const movementDate = body.movementDate ?? new Date().toISOString().slice(0, 10);
    const refId = newBatchRefId();
    const reasonNote = body.reason.trim();

    try {
      const movements = await runInTransaction(async (manager) => {
        const out: Awaited<ReturnType<typeof applyMovement>>[] = [];
        for (const line of body.lines) {
          await assertProductInScope(line.productId, branchId);
          const delta = parseDecimalStrict(line.quantityDelta);
          const mov = await applyMovement(manager, {
            productId: line.productId,
            warehouseId: body.warehouseId,
            quantityDelta: delta,
            refType: 'adjustment',
            refId,
            movementDate,
            branchId,
            notes: reasonNote,
            userId,
          });
          out.push(mov);
        }
        return out;
      });

      const loaded = await dataSource.getRepository(InventoryMovement).find({
        where: { id: In(movements.map((m) => m.id)) },
        relations: ['product', 'warehouse'],
      });
      const byId = new Map(loaded.map((m) => [m.id, m]));
      const ordered = movements.map((m) => byId.get(m.id) ?? m);

      res.status(201).json({
        data: {
          refId,
          movementIds: movements.map((m) => m.id),
          movements: ordered.map(serializeMovement),
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to post adjustment';
      res.status(400).json({ error: msg });
    }
  }
);
