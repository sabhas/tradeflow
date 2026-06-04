import { SupplierInvoice, type SupplierInvoiceLine } from '@tradeflow/db';
import { nullable } from '../../../shared/utils/serializeHelpers';

export function serializeSupplierInvoice(inv: SupplierInvoice, lines?: SupplierInvoiceLine[]) {
  return {
    id: inv.id,
    supplierId: inv.supplierId,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    purchaseOrderId: nullable(inv.purchaseOrderId),
    grnId: nullable(inv.grnId),
    status: inv.status,
    subtotal: inv.subtotal,
    taxAmount: inv.taxAmount,
    discountAmount: inv.discountAmount,
    total: inv.total,
    notes: nullable(inv.notes),
    createdBy: nullable(inv.createdBy),
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
    supplier: inv.supplier ? { id: inv.supplier.id, name: inv.supplier.name } : undefined,
    lines:
      lines?.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        bonusQuantity: l.bonusQuantity ?? '0',
        unitPrice: l.unitPrice,
        taxAmount: l.taxAmount,
        discountAmount: l.discountAmount,
        grnLineId: nullable(l.grnLineId),
        taxProfileId: nullable(l.taxProfileId),
      })) ?? undefined,
  };
}
