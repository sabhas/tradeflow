import { Grn, GrnLine } from '@tradeflow/db';
import { nullable } from '../../../shared/utils/serializeHelpers';
import { settlementFields, type LinkedSupplierInvoice } from '../services/grnInvoiceSettlement';

export function serializeGrn(g: Grn, lines?: GrnLine[], linked?: LinkedSupplierInvoice | null) {
  return {
    id: g.id,
    purchaseOrderId: nullable(g.purchaseOrderId),
    supplierId: g.supplierId,
    grnDate: g.grnDate,
    warehouseId: g.warehouseId,
    status: g.status,
    createdBy: nullable(g.createdBy),
    createdAt: g.createdAt,
    ...settlementFields(g.status, linked),
    supplier: g.supplier ? { id: g.supplier.id, name: g.supplier.name } : undefined,
    warehouse: g.warehouse ? { id: g.warehouse.id, name: g.warehouse.name } : undefined,
    lines:
      lines?.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        bonusQuantity: l.bonusQuantity ?? '0',
        unitPrice: l.unitPrice,
        tradePrice: nullable(l.tradePrice),
        retailPrice: nullable(l.retailPrice),
        purchaseOrderLineId: nullable(l.purchaseOrderLineId),
        batchCode: nullable(l.batchCode),
        expiryDate: l.expiryDate ? String(l.expiryDate).slice(0, 10) : null,
      })) ?? undefined,
  };
}
