// @ts-nocheck
import type { Request } from 'express';
import type { z } from 'zod';
import { createStockTransferSchema } from '@tradeflow/shared';
import { StockTransfer, StockTransferLine } from '@tradeflow/db';
import { getPagination } from '../utils/pagination';
import {
  assertProductInScope,
  assertWarehouseInScope,
  runInTransaction,
} from '../services/inventoryService';
import { postStockTransferTx } from '../services/stockTransferPosting';
import { parseDecimalStrict } from '../utils/decimal';
import { created, ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

type CreateStockTransferInput = z.infer<typeof createStockTransferSchema>;

function serialize(t: StockTransfer, lines?: StockTransferLine[]) {
  return {
    id: t.id,
    fromWarehouseId: t.fromWarehouseId,
    toWarehouseId: t.toWarehouseId,
    transferDate: t.transferDate,
    status: t.status,
    notes: t.notes ?? null,
    createdBy: t.createdBy ?? null,
    createdAt: t.createdAt,
    fromWarehouse: t.fromWarehouse
      ? { id: t.fromWarehouse.id, name: t.fromWarehouse.name, code: t.fromWarehouse.code }
      : undefined,
    toWarehouse: t.toWarehouse
      ? { id: t.toWarehouse.id, name: t.toWarehouse.name, code: t.toWarehouse.code }
      : undefined,
    lines:
      lines?.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        product: l.product ? { id: l.product.id, sku: l.product.sku, name: l.product.name } : undefined,
      })) ?? undefined,
  };
}

export async function listStockTransfers(req: Request): Promise<ControllerResult> {
  const branchId = undefined;
  const { limit, offset } = getPagination(req);
  const qb = StockTransfer
    .createQueryBuilder('t')
    .leftJoinAndSelect('t.fromWarehouse', 'fw')
    .leftJoinAndSelect('t.toWarehouse', 'tw');
  if (branchId) qb.andWhere('(t.branch_id IS NULL OR t.branch_id = :bid)', { bid: branchId });
  qb.orderBy('t.transfer_date', 'DESC').addOrderBy('t.created_at', 'DESC').take(limit).skip(offset);
  const [rows, total] = await qb.getManyAndCount();
  return ok({ data: rows.map((r) => serialize(r)), meta: { total, limit, offset } });
}

export async function getStockTransfer(req: Request): Promise<ControllerResult> {
  const t = await StockTransfer.findOne({
    where: { id: req.params.id },
    relations: ['lines', 'lines.product', 'fromWarehouse', 'toWarehouse'],
  });
  if (!t) {
    throw new HttpError(404, { error: 'Not found' });
  }
  return ok({ data: serialize(t, t.lines) });
}

export async function createStockTransfer(
  req: Request,
  body: CreateStockTransferInput
): Promise<ControllerResult> {
  if (body.fromWarehouseId === body.toWarehouseId) {
    throw new HttpError(400, { error: 'Source and destination warehouse must differ' });
  }
  const branchId = undefined ?? req.user?.branchId ?? undefined;
  const userId = req.auth?.userId;
  try {
    await assertWarehouseInScope(body.fromWarehouseId, branchId);
    await assertWarehouseInScope(body.toWarehouseId, branchId);
    for (const ln of body.lines) {
      await assertProductInScope(ln.productId, branchId);
      parseDecimalStrict(String(ln.quantity));
    }
  } catch (e) {
    throw new HttpError(400, { error: e instanceof Error ? e.message : 'Bad request' });
  }

  try {
    const row = await runInTransaction(async (manager) => {
      const t = manager.create(StockTransfer, {
        fromWarehouseId: body.fromWarehouseId,
        toWarehouseId: body.toWarehouseId,
        transferDate: body.transferDate.slice(0, 10),
        status: 'draft',
        notes: body.notes?.trim() || undefined,
        createdBy: userId,
      });
      await manager.save(t);
      for (const ln of body.lines) {
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
    return created({ data: serialize(row, row.lines) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, { error: e instanceof Error ? e.message : 'Failed to create transfer' });
  }
}

export async function postStockTransfer(req: Request): Promise<ControllerResult> {
  try {
    const row = await runInTransaction(async (manager) => {
      const t = await manager.findOne(StockTransfer, {
        where: { id: req.params.id },
        relations: ['lines'],
      });
      if (!t) throw new HttpError(404, { error: 'Not found' });
      if (t.status !== 'draft') throw new HttpError(400, { error: 'Only draft transfers can be posted' });
      if (!t.lines?.length) throw new HttpError(400, { error: 'Transfer has no lines' });

      const branchId = undefined ?? undefined;
      await postStockTransferTx(manager, t, t.lines, req.auth?.userId, branchId);

      t.status = 'posted';
      await manager.save(t);

      return manager.findOneOrFail(StockTransfer, {
        where: { id: t.id },
        relations: ['lines', 'lines.product', 'fromWarehouse', 'toWarehouse'],
      });
    });
    return ok({ data: serialize(row, row.lines) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, { error: e instanceof Error ? e.message : 'Post failed' });
  }
}
