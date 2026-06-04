import { PurchaseReturn, PurchaseReturnLine } from '@tradeflow/db';
import { nullable } from '../../../shared/utils/serializeHelpers';

export function serializePurchaseReturn(row: PurchaseReturn, lines?: PurchaseReturnLine[]) {
  return {
    id: row.id,
    supplierId: row.supplierId,
    returnDate: row.returnDate,
    warehouseId: row.warehouseId,
    status: row.status,
    subtotal: row.subtotal,
    taxAmount: row.taxAmount,
    discountAmount: row.discountAmount,
    total: row.total,
    notes: nullable(row.notes),
    grnId: nullable(row.grnId),
    createdBy: nullable(row.createdBy),
    createdAt: row.createdAt,
    supplier: row.supplier ? { id: row.supplier.id, name: row.supplier.name } : undefined,
    warehouse: row.warehouse ? { id: row.warehouse.id, name: row.warehouse.name } : undefined,
    lines:
      lines?.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxAmount: l.taxAmount,
        discountAmount: l.discountAmount,
        taxProfileId: nullable(l.taxProfileId),
        grnLineId: nullable(l.grnLineId),
      })) ?? undefined,
  };
}
