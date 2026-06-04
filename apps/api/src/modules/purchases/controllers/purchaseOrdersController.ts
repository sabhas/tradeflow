import type { Request } from 'express';
import type { z } from 'zod';
import { PurchaseOrder } from '@tradeflow/db';
import {
  createPurchaseOrderSchema,
  listPurchaseOrdersQuerySchema,
  updatePurchaseOrderSchema,
} from '@tradeflow/shared';
import { getValidatedQuery } from '../../../shared/middleware/validate';
import { getPaginationFromQuery } from '../../../shared/utils/pagination';
import { created, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';
import {
  createPurchaseOrder as createPurchaseOrderService,
  updatePurchaseOrder as updatePurchaseOrderService,
} from '../services/purchaseOrderService';
import { serializePurchaseOrder } from '../serializers/purchaseOrder.serializer';

type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;

export async function getPurchaseOrderSnapshotForAudit(id: string) {
  const po = await PurchaseOrder.findOne({ where: { id } });
  return po ? serializePurchaseOrder(po) : undefined;
}

type ListPurchaseOrdersQuery = z.infer<typeof listPurchaseOrdersQuerySchema>;

export async function listPurchaseOrders(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<ListPurchaseOrdersQuery>(req);
  const { limit, offset } = getPaginationFromQuery(q);
  const qb = PurchaseOrder.createQueryBuilder('po')
    .leftJoinAndSelect('po.supplier', 's')
    .leftJoinAndSelect('po.warehouse', 'w')
    .where('1=1');
  if (q.supplierId) qb.andWhere('po.supplierId = :sid', { sid: q.supplierId });
  if (q.status) qb.andWhere('po.status = :st', { st: q.status });

  qb.orderBy('po.orderDate', 'DESC').addOrderBy('po.createdAt', 'DESC').take(limit).skip(offset);
  const [rows, total] = await qb.getManyAndCount();
  return ok({
    data: rows.map((r) => serializePurchaseOrder(r)),
    meta: { total, limit, offset },
  });
}

export async function getPurchaseOrderGrnEligible(req: Request): Promise<ControllerResult> {
  const po = await PurchaseOrder.findOne({
    where: { id: req.params.id },
    relations: ['lines', 'lines.product'],
  });
  if (!po) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (po.status !== 'sent' && po.status !== 'draft') {
    throw new HttpError(400, { error: 'PO must be draft or sent to receive' });
  }
  const eligible = po.lines?.filter((l) => parseFloat(l.receivedQuantity) < parseFloat(l.quantity)) ?? [];
  return ok({
    data: {
      purchaseOrderId: po.id,
      supplierId: po.supplierId,
      warehouseId: po.warehouseId,
      lines: eligible.map((l) => ({
        purchaseOrderLineId: l.id,
        productId: l.productId,
        productName: l.product?.name,
        batchTracked: l.product?.batchTracked ?? false,
        expiryTracked: l.product?.expiryTracked ?? false,
        ordered: l.quantity,
        received: l.receivedQuantity,
        remaining: (parseFloat(l.quantity) - parseFloat(l.receivedQuantity)).toFixed(4),
        unitPrice: l.unitPrice,
      })),
    },
  });
}

export async function getPurchaseOrder(req: Request): Promise<ControllerResult> {
  const po = await PurchaseOrder.findOne({
    where: { id: req.params.id },
    relations: ['lines', 'supplier', 'warehouse'],
  });
  if (!po) {
    throw new HttpError(404, { error: 'Not found' });
  }
  return ok({ data: serializePurchaseOrder(po, po.lines) });
}

export async function createPurchaseOrder(
  req: Request,
  body: CreatePurchaseOrderInput
): Promise<ControllerResult> {
  const row = await createPurchaseOrderService(body, req.auth?.userId);
  return created({ data: serializePurchaseOrder(row, row.lines) });
}

export async function updatePurchaseOrder(
  req: Request,
  body: UpdatePurchaseOrderInput
): Promise<ControllerResult> {
  const row = await updatePurchaseOrderService(req.params.id, body);
  return ok({ data: serializePurchaseOrder(row, row.lines) });
}

export async function sendPurchaseOrder(req: Request): Promise<ControllerResult> {
  const repo = PurchaseOrder.getRepository();
  const po = await repo.findOne({
    where: { id: req.params.id },
    relations: ['lines', 'supplier', 'warehouse'],
  });
  if (!po) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (po.status !== 'draft') {
    throw new HttpError(400, { error: 'Only draft orders can be sent' });
  }
  po.status = 'sent';
  await repo.save(po);
  return ok({ data: serializePurchaseOrder(po, po.lines) });
}

export async function deletePurchaseOrder(req: Request): Promise<ControllerResult> {
  const repo = PurchaseOrder.getRepository();
  const po = await repo.findOne({ where: { id: req.params.id } });
  if (!po) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (po.status !== 'draft') {
    throw new HttpError(400, { error: 'Only draft purchase orders can be deleted' });
  }
  await repo.remove(po);
  return ok({ data: { id: req.params.id, deleted: true } });
}
