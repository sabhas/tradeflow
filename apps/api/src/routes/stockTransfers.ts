import { Router } from 'express';
import { dataSource, StockTransfer, StockTransferLine } from '@tradeflow/db';
import { createStockTransferSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';
import {
  assertProductInScope,
  assertWarehouseInScope,
  runInTransaction,
} from '../services/inventoryService';
import { postStockTransferTx } from '../services/stockTransferPosting';
import { parseDecimalStrict } from '../utils/decimal';

export const stockTransfersRouter = Router();
stockTransfersRouter.use(authMiddleware, loadUser);

function serialize(t: StockTransfer, lines?: StockTransferLine[]) {
  return {
    id: t.id,
    fromWarehouseId: t.fromWarehouseId,
    toWarehouseId: t.toWarehouseId,
    transferDate: t.transferDate,
    status: t.status,
    notes: t.notes ?? null,
    branchId: t.branchId ?? null,
    createdBy: t.createdBy ?? null,
    createdAt: t.createdAt,
    fromWarehouse: t.fromWarehouse ? { id: t.fromWarehouse.id, name: t.fromWarehouse.name, code: t.fromWarehouse.code } : undefined,
    toWarehouse: t.toWarehouse ? { id: t.toWarehouse.id, name: t.toWarehouse.name, code: t.toWarehouse.code } : undefined,
    lines:
      lines?.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        product: l.product ? { id: l.product.id, sku: l.product.sku, name: l.product.name } : undefined,
      })) ?? undefined,
  };
}

stockTransfersRouter.get('/', requirePermission('inventory', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const { limit, offset } = getPagination(req);
  const qb = dataSource
    .getRepository(StockTransfer)
    .createQueryBuilder('t')
    .leftJoinAndSelect('t.fromWarehouse', 'fw')
    .leftJoinAndSelect('t.toWarehouse', 'tw');
  if (branchId) qb.andWhere('(t.branch_id IS NULL OR t.branch_id = :bid)', { bid: branchId });
  qb.orderBy('t.transfer_date', 'DESC').addOrderBy('t.created_at', 'DESC').take(limit).skip(offset);
  const [rows, total] = await qb.getManyAndCount();
  res.json({ data: rows.map((r) => serialize(r)), meta: { total, limit, offset } });
});

stockTransfersRouter.get('/:id', requirePermission('inventory', 'read'), async (req, res) => {
  const t = await dataSource.getRepository(StockTransfer).findOne({
    where: { id: req.params.id },
    relations: ['lines', 'lines.product', 'fromWarehouse', 'toWarehouse'],
  });
  if (!t) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ data: serialize(t, t.lines) });
});

stockTransfersRouter.post(
  '/',
  requirePermission('inventory', 'write'),
  auditMiddleware({ entity: 'StockTransfer', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createStockTransferSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    if (b.fromWarehouseId === b.toWarehouseId) {
      res.status(400).json({ error: 'Source and destination warehouse must differ' });
      return;
    }
    const branchId = b.branchId ?? req.user?.branchId ?? undefined;
    const userId = req.auth?.userId;
    try {
      await assertWarehouseInScope(b.fromWarehouseId, branchId);
      await assertWarehouseInScope(b.toWarehouseId, branchId);
      for (const ln of b.lines) {
        await assertProductInScope(ln.productId, branchId);
        parseDecimalStrict(String(ln.quantity));
      }
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Bad request' });
      return;
    }

    try {
      const row = await runInTransaction(async (manager) => {
        const t = manager.create(StockTransfer, {
          fromWarehouseId: b.fromWarehouseId,
          toWarehouseId: b.toWarehouseId,
          transferDate: b.transferDate.slice(0, 10),
          status: 'draft',
          notes: b.notes?.trim() || undefined,
          branchId: branchId ?? undefined,
          createdBy: userId,
        });
        await manager.save(t);
        for (const ln of b.lines) {
          await manager.save(
            manager.create(StockTransferLine, {
              transferId: t.id,
              productId: ln.productId,
              quantity: parseDecimalStrict(String(ln.quantity)),
            })
          );
        }
        return manager.findOneOrFail(StockTransfer, {
          where: { id: t.id },
          relations: ['lines', 'lines.product', 'fromWarehouse', 'toWarehouse'],
        });
      });
      res.status(201).json({ data: serialize(row, row.lines) });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Failed to create transfer' });
    }
  }
);

stockTransfersRouter.post(
  '/:id/post',
  requirePermission('inventory', 'write'),
  auditMiddleware({
    entity: 'StockTransfer',
    getEntityId: (req) => req.params.id,
    getNewValue: () => ({ status: 'posted' }),
  }),
  async (req, res) => {
    try {
      const row = await runInTransaction(async (manager) => {
        const t = await manager.findOne(StockTransfer, {
          where: { id: req.params.id },
          relations: ['lines'],
        });
        if (!t) throw new Error('Not found');
        if (t.status !== 'draft') throw new Error('Only draft transfers can be posted');
        if (!t.lines?.length) throw new Error('Transfer has no lines');

        const branchId = t.branchId ?? undefined;
        await postStockTransferTx(manager, t, t.lines, req.auth?.userId, branchId);

        t.status = 'posted';
        await manager.save(t);

        return manager.findOneOrFail(StockTransfer, {
          where: { id: t.id },
          relations: ['lines', 'lines.product', 'fromWarehouse', 'toWarehouse'],
        });
      });
      res.json({ data: serialize(row, row.lines) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Post failed';
      if (msg === 'Not found') res.status(404).json({ error: msg });
      else res.status(400).json({ error: msg });
    }
  }
);
