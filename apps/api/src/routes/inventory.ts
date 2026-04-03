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
  res.json({ data: rows.map(serializeBalance) });
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
