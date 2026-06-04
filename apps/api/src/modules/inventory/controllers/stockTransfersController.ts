import type { Request } from 'express';
import type { z } from 'zod';
import { createStockTransferSchema, listStockTransfersQuerySchema } from '@tradeflow/shared';
import { StockTransfer, StockTransferLine } from '@tradeflow/db';
import { getValidatedQuery } from '../../../shared/middleware/validate';
import { getPaginationFromQuery } from '../../../shared/utils/pagination';
import { assertProductInScope, assertWarehouseInScope, runInTransaction } from '../services/inventoryService';
import { postStockTransferTx } from '../services/stockTransferPosting';
import { parseDecimalStrict } from '../../../shared/utils/decimal';
import { created, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';
import { serializeStockTransfer } from '../serializers/stockTransfer.serializer';

type CreateStockTransferInput = z.infer<typeof createStockTransferSchema>;

export async function listStockTransfers(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof listStockTransfersQuerySchema>>(req);
  const { limit, offset } = getPaginationFromQuery(q);
  const qb = StockTransfer.createQueryBuilder('t')
    .leftJoinAndSelect('t.fromWarehouse', 'fw')
    .leftJoinAndSelect('t.toWarehouse', 'tw');
  if (q.status) qb.andWhere('t.status = :st', { st: q.status });
  qb.orderBy('t.transfer_date', 'DESC').addOrderBy('t.created_at', 'DESC').take(limit).skip(offset);
  const [rows, total] = await qb.getManyAndCount();
  return ok({ data: rows.map((r) => serializeStockTransfer(r)), meta: { total, limit, offset } });
}

export async function getStockTransfer(req: Request): Promise<ControllerResult> {
  const t = await StockTransfer.findOne({
    where: { id: req.params.id },
    relations: ['lines', 'lines.product', 'fromWarehouse', 'toWarehouse'],
  });
  if (!t) {
    throw new HttpError(404, { error: 'Not found' });
  }
  return ok({ data: serializeStockTransfer(t, t.lines) });
}

export async function createStockTransfer(
  req: Request,
  body: CreateStockTransferInput
): Promise<ControllerResult> {
  if (body.fromWarehouseId === body.toWarehouseId) {
    throw new HttpError(400, { error: 'Source and destination warehouse must differ' });
  }
  const userId = req.auth?.userId;
  await assertWarehouseInScope(body.fromWarehouseId, undefined);
  await assertWarehouseInScope(body.toWarehouseId, undefined);
  for (const ln of body.lines) {
    await assertProductInScope(ln.productId, undefined);
    parseDecimalStrict(String(ln.quantity));
  }

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
  return created({ data: serializeStockTransfer(row, row.lines) });
}

export async function postStockTransfer(req: Request): Promise<ControllerResult> {
  const row = await runInTransaction(async (manager) => {
    const t = await manager.findOne(StockTransfer, {
      where: { id: req.params.id },
      relations: ['lines'],
    });
    if (!t) throw new HttpError(404, { error: 'Not found' });
    if (t.status !== 'draft') throw new HttpError(400, { error: 'Only draft transfers can be posted' });
    if (!t.lines?.length) throw new HttpError(400, { error: 'Transfer has no lines' });
    await postStockTransferTx(manager, t, t.lines, req.auth?.userId);

    t.status = 'posted';
    await manager.save(t);

    return manager.findOneOrFail(StockTransfer, {
      where: { id: t.id },
      relations: ['lines', 'lines.product', 'fromWarehouse', 'toWarehouse'],
    });
  });
  return ok({ data: serializeStockTransfer(row, row.lines) });
}
