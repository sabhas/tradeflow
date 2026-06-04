import { PurchaseOrder, PurchaseOrderLine } from '@tradeflow/db';
import { nullable } from '../../../shared/utils/serializeHelpers';

export function serializePurchaseOrder(po: PurchaseOrder, lines?: PurchaseOrderLine[]) {
  return {
    id: po.id,
    supplierId: po.supplierId,
    orderDate: po.orderDate,
    expectedDate: nullable(po.expectedDate),
    status: po.status,
    warehouseId: po.warehouseId,
    subtotal: po.subtotal,
    taxAmount: po.taxAmount,
    discountAmount: po.discountAmount,
    total: po.total,
    notes: nullable(po.notes),
    createdBy: nullable(po.createdBy),
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
        taxProfileId: nullable(l.taxProfileId),
      })) ?? undefined,
  };
}
