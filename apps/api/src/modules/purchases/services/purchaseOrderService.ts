import type { z } from 'zod';
import { PurchaseOrder, PurchaseOrderLine } from '@tradeflow/db';
import { createPurchaseOrderSchema, updatePurchaseOrderSchema } from '@tradeflow/shared';
import { computePurchaseDocumentTotals } from './purchaseTotals';
import {
  runInTransaction,
  assertProductInScope,
  assertWarehouseInScope,
} from '../../inventory/services/inventoryService';
import { HttpError } from '../../../shared/utils/httpError';

type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;

export async function createPurchaseOrder(
  body: CreatePurchaseOrderInput,
  userId: string | undefined
): Promise<PurchaseOrder> {
  const b = body;

  await assertWarehouseInScope(b.warehouseId, undefined);

  return runInTransaction(async (manager) => {
    for (const line of b.lines) {
      await assertProductInScope(line.productId, undefined);
    }
    const totals = await computePurchaseDocumentTotals(
      manager,
      b.supplierId,
      b.lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
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
}

export async function updatePurchaseOrder(
  id: string,
  body: UpdatePurchaseOrderInput
): Promise<PurchaseOrder> {
  const b = body;

  return runInTransaction(async (manager) => {
    const po = await manager.findOne(PurchaseOrder, {
      where: { id },
      relations: ['lines'],
    });
    if (!po) throw new HttpError(404, { error: 'Not found' });
    const linesIn =
      b.lines?.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: String(l.unitPrice),
        discountAmount: l.discountAmount != null ? String(l.discountAmount) : '0',
        taxProfileId: l.taxProfileId,
      })) ?? undefined;

    if (linesIn && po.status !== 'draft')
      throw new HttpError(400, { error: 'Only draft orders can change line items' });
    if (linesIn) {
      const anyReceived = (po.lines ?? []).some((l) => parseFloat(l.receivedQuantity) > 0.00005);
      if (anyReceived)
        throw new HttpError(400, { error: 'Cannot replace lines after goods have been received' });
    }
    if (po.status !== 'draft' && po.status !== 'sent') {
      throw new HttpError(400, { error: 'Purchase order cannot be edited' });
    }
    if (po.status === 'sent' && (linesIn || b.supplierId !== undefined || b.warehouseId !== undefined)) {
      throw new HttpError(400, { error: 'Sent orders can only update notes, dates, or header discount' });
    }

    if (b.warehouseId !== undefined) await assertWarehouseInScope(b.warehouseId, undefined);
    else await assertWarehouseInScope(po.warehouseId, undefined);

    const nextSupplier = b.supplierId ?? po.supplierId;
    if (b.orderDate !== undefined) po.orderDate = b.orderDate.slice(0, 10);
    if (b.expectedDate !== undefined) po.expectedDate = b.expectedDate?.slice(0, 10) ?? undefined;
    if (b.supplierId !== undefined) po.supplierId = b.supplierId;
    if (b.warehouseId !== undefined) po.warehouseId = b.warehouseId;
    if (b.notes !== undefined) po.notes = b.notes ?? undefined;

    if (linesIn) {
      for (const line of linesIn) {
        await assertProductInScope(line.productId, undefined);
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
          quantity: parseFloat(l.quantity),
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
          taxProfileId: l.taxProfileId,
        })) ?? [];
      if (existingLines.length === 0) throw new HttpError(400, { error: 'No lines on purchase order' });
      const totals = await computePurchaseDocumentTotals(
        manager,
        nextSupplier,
        existingLines,
        b.discountAmount
      );
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
}
