import type { Request } from 'express';
import type { z } from 'zod';
import { dataSource, PurchaseOrder, PurchaseOrderLine } from '@tradeflow/db';
import { createPurchaseOrderSchema, updatePurchaseOrderSchema } from '@tradeflow/shared';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';
import { computePurchaseDocumentTotals } from '../services/purchaseTotals';
import { runInTransaction, assertProductInScope, assertWarehouseInScope } from '../services/inventoryService';
import { created, ok, type ControllerResult } from './controllerResult';
import { HttpError } from './httpError';

type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;

export function serializePurchaseOrder(po: PurchaseOrder, lines?: PurchaseOrderLine[]) {
  return {
    id: po.id,
    supplierId: po.supplierId,
    orderDate: po.orderDate,
    expectedDate: po.expectedDate ?? null,
    status: po.status,
    warehouseId: po.warehouseId,
    subtotal: po.subtotal,
    taxAmount: po.taxAmount,
    discountAmount: po.discountAmount,
    total: po.total,
    notes: po.notes ?? null,
    branchId: po.branchId ?? null,
    createdBy: po.createdBy ?? null,
    createdAt: po.createdAt,
    updatedAt: po.updatedAt,
    supplier: po.supplier ? { id: po.supplier.id, name: po.supplier.name } : undefined,
    warehouse: po.warehouse ? { id: po.warehouse.id, name: po.warehouse.name } : undefined,
    lines:
      lines?.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxAmount: l.taxAmount,
        discountAmount: l.discountAmount,
        receivedQuantity: l.receivedQuantity,
        taxProfileId: l.taxProfileId ?? null,
      })) ?? undefined,
  };
}

export async function getPurchaseOrderSnapshotForAudit(id: string) {
  const po = await dataSource.getRepository(PurchaseOrder).findOne({ where: { id } });
  return po ? serializePurchaseOrder(po) : undefined;
}

export async function listPurchaseOrders(req: Request): Promise<ControllerResult> {
  const branchId = resolveBranchId(req);
  const { limit, offset } = getPagination(req);
  const qb = dataSource
    .getRepository(PurchaseOrder)
    .createQueryBuilder('po')
    .leftJoinAndSelect('po.supplier', 's')
    .leftJoinAndSelect('po.warehouse', 'w')
    .where('1=1');

  if (branchId) qb.andWhere('(po.branch_id IS NULL OR po.branch_id = :bid)', { bid: branchId });
  if (req.query.supplierId) qb.andWhere('po.supplier_id = :sid', { sid: req.query.supplierId });
  if (req.query.status) qb.andWhere('po.status = :st', { st: req.query.status });

  qb.orderBy('po.order_date', 'DESC').addOrderBy('po.created_at', 'DESC').take(limit).skip(offset);
  const [rows, total] = await qb.getManyAndCount();
  return ok({
    data: rows.map((r) => serializePurchaseOrder(r)),
    meta: { total, limit, offset },
  });
}

export async function getPurchaseOrderGrnEligible(req: Request): Promise<ControllerResult> {
  const po = await dataSource.getRepository(PurchaseOrder).findOne({
    where: { id: req.params.id },
    relations: ['lines', 'lines.product'],
  });
  if (!po) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (po.status !== 'sent' && po.status !== 'draft') {
    throw new HttpError(400, { error: 'PO must be draft or sent to receive' });
  }
  const eligible =
    po.lines?.filter((l) => parseFloat(l.receivedQuantity) < parseFloat(l.quantity)) ?? [];
  return ok({
    data: {
      purchaseOrderId: po.id,
      supplierId: po.supplierId,
      warehouseId: po.warehouseId,
      lines: eligible.map((l) => ({
        purchaseOrderLineId: l.id,
        productId: l.productId,
        productName: l.product?.name,
        ordered: l.quantity,
        received: l.receivedQuantity,
        remaining: (parseFloat(l.quantity) - parseFloat(l.receivedQuantity)).toFixed(4),
        unitPrice: l.unitPrice,
      })),
    },
  });
}

export async function getPurchaseOrder(req: Request): Promise<ControllerResult> {
  const po = await dataSource.getRepository(PurchaseOrder).findOne({
    where: { id: req.params.id },
    relations: ['lines', 'supplier', 'warehouse'],
  });
  if (!po) {
    throw new HttpError(404, { error: 'Not found' });
  }
  return ok({ data: serializePurchaseOrder(po, po.lines) });
}

export async function createPurchaseOrder(req: Request, body: CreatePurchaseOrderInput): Promise<ControllerResult> {
  const b = body;
  const branchId = b.branchId ?? req.user?.branchId ?? undefined;
  const userId = req.auth?.userId;

  try {
    await assertWarehouseInScope(b.warehouseId, branchId);
  } catch (e) {
    throw new HttpError(400, { error: e instanceof Error ? e.message : 'Bad request' });
  }

  try {
    const row = await runInTransaction(async (manager) => {
      for (const line of b.lines) {
        await assertProductInScope(line.productId, branchId);
      }
      const totals = await computePurchaseDocumentTotals(
        manager,
        b.supplierId,
        b.lines.map((l) => ({
          productId: l.productId,
          quantity: String(l.quantity),
          unitPrice: String(l.unitPrice),
          discountAmount: l.discountAmount != null ? String(l.discountAmount) : '0',
          taxProfileId: l.taxProfileId,
        })),
        b.discountAmount
      );

      const po = manager.create(PurchaseOrder, {
        supplierId: b.supplierId,
        orderDate: b.orderDate.slice(0, 10),
        expectedDate: b.expectedDate?.slice(0, 10) ?? undefined,
        status: 'draft',
        warehouseId: b.warehouseId,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discountAmount: totals.discountAmount,
        total: totals.total,
        notes: b.notes ?? undefined,
        branchId: branchId ?? undefined,
        createdBy: userId,
      });
      await manager.save(po);

      for (let i = 0; i < totals.lines.length; i++) {
        const cmp = totals.lines[i];
        const src = b.lines[i];
        await manager.save(
          manager.create(PurchaseOrderLine, {
            purchaseOrderId: po.id,
            productId: cmp.productId,
            quantity: String(src.quantity),
            unitPrice: String(src.unitPrice),
            taxAmount: cmp.taxAmount,
            discountAmount: cmp.discountAmount,
            receivedQuantity: '0.0000',
            taxProfileId: src.taxProfileId ?? undefined,
          })
        );
      }

      return manager.findOneOrFail(PurchaseOrder, {
        where: { id: po.id },
        relations: ['lines', 'supplier', 'warehouse'],
      });
    });
    return created({ data: serializePurchaseOrder(row, row.lines) });
  } catch (e) {
    throw new HttpError(400, { error: e instanceof Error ? e.message : 'Failed to create PO' });
  }
}

export async function updatePurchaseOrder(req: Request, body: UpdatePurchaseOrderInput): Promise<ControllerResult> {
  const b = body;
  const branchId = b.branchId ?? req.user?.branchId ?? undefined;
  try {
    const row = await runInTransaction(async (manager) => {
      const po = await manager.findOne(PurchaseOrder, {
        where: { id: req.params.id },
        relations: ['lines'],
      });
      if (!po) throw new HttpError(404, { error: 'Not found' });
      const linesIn =
        b.lines?.map((l) => ({
          productId: l.productId,
          quantity: String(l.quantity),
          unitPrice: String(l.unitPrice),
          discountAmount: l.discountAmount != null ? String(l.discountAmount) : '0',
          taxProfileId: l.taxProfileId,
        })) ?? undefined;

      if (linesIn && po.status !== 'draft') throw new HttpError(400, { error: 'Only draft orders can change line items' });
      if (linesIn) {
        const anyReceived = (po.lines ?? []).some((l) => parseFloat(l.receivedQuantity) > 0.00005);
        if (anyReceived) throw new HttpError(400, { error: 'Cannot replace lines after goods have been received' });
      }
      if (po.status !== 'draft' && po.status !== 'sent') {
        throw new HttpError(400, { error: 'Purchase order cannot be edited' });
      }
      if (po.status === 'sent' && (linesIn || b.supplierId !== undefined || b.warehouseId !== undefined)) {
        throw new HttpError(400, { error: 'Sent orders can only update notes, dates, or header discount' });
      }

      if (b.warehouseId !== undefined) await assertWarehouseInScope(b.warehouseId, branchId);
      else await assertWarehouseInScope(po.warehouseId, branchId);

      const nextSupplier = b.supplierId ?? po.supplierId;
      if (b.orderDate !== undefined) po.orderDate = b.orderDate.slice(0, 10);
      if (b.expectedDate !== undefined) po.expectedDate = b.expectedDate?.slice(0, 10) ?? undefined;
      if (b.supplierId !== undefined) po.supplierId = b.supplierId;
      if (b.warehouseId !== undefined) po.warehouseId = b.warehouseId;
      if (b.notes !== undefined) po.notes = b.notes ?? undefined;
      if (b.branchId !== undefined) po.branchId = b.branchId ?? undefined;

      if (linesIn) {
        for (const line of linesIn) {
          await assertProductInScope(line.productId, branchId);
        }
        const totals = await computePurchaseDocumentTotals(
          manager,
          nextSupplier,
          linesIn,
          b.discountAmount ?? po.discountAmount
        );
        po.subtotal = totals.subtotal;
        po.taxAmount = totals.taxAmount;
        po.discountAmount = totals.discountAmount;
        po.total = totals.total;
        await manager.delete(PurchaseOrderLine, { purchaseOrderId: po.id });
        for (let i = 0; i < totals.lines.length; i++) {
          const cmp = totals.lines[i];
          const src = linesIn[i];
          await manager.save(
            manager.create(PurchaseOrderLine, {
              purchaseOrderId: po.id,
              productId: cmp.productId,
              quantity: String(src.quantity),
              unitPrice: String(src.unitPrice),
              taxAmount: cmp.taxAmount,
              discountAmount: cmp.discountAmount,
              receivedQuantity: '0.0000',
              taxProfileId: src.taxProfileId ?? undefined,
            })
          );
        }
      } else if (b.discountAmount !== undefined) {
        const dbLines = await manager.find(PurchaseOrderLine, { where: { purchaseOrderId: po.id } });
        const existingLines =
          dbLines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountAmount: l.discountAmount,
            taxProfileId: l.taxProfileId,
          })) ?? [];
        if (existingLines.length === 0) throw new HttpError(400, { error: 'No lines on purchase order' });
        const totals = await computePurchaseDocumentTotals(manager, nextSupplier, existingLines, b.discountAmount);
        po.subtotal = totals.subtotal;
        po.taxAmount = totals.taxAmount;
        po.discountAmount = totals.discountAmount;
        po.total = totals.total;
        for (let i = 0; i < totals.lines.length; i++) {
          dbLines[i].taxAmount = totals.lines[i].taxAmount;
          dbLines[i].discountAmount = totals.lines[i].discountAmount ?? '0.0000';
          await manager.save(dbLines[i]);
        }
      }

      await manager.save(po);
      return manager.findOneOrFail(PurchaseOrder, {
        where: { id: po.id },
        relations: ['lines', 'supplier', 'warehouse'],
      });
    });
    return ok({ data: serializePurchaseOrder(row, row.lines) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const msg = e instanceof Error ? e.message : 'Update failed';
    throw new HttpError(400, { error: msg });
  }
}

export async function sendPurchaseOrder(req: Request): Promise<ControllerResult> {
  const repo = dataSource.getRepository(PurchaseOrder);
  const po = await repo.findOne({ where: { id: req.params.id }, relations: ['lines', 'supplier', 'warehouse'] });
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
  const repo = dataSource.getRepository(PurchaseOrder);
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
