import { Invoice, type InvoiceLine } from '@tradeflow/db';
import { toIsoDateString } from '../../../shared/utils/date';
import { nullable } from '../../../shared/utils/serializeHelpers';

export function serializeInvoice(inv: Invoice, lines?: InvoiceLine[]) {
  return {
    id: inv.id,
    customerId: inv.customerId,
    customerName: nullable(inv.customer?.name),
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    status: inv.status,
    paymentType: inv.paymentType,
    documentKind: inv.documentKind ?? 'invoice',
    originalInvoiceId: nullable(inv.originalInvoiceId),
    warehouseId: inv.warehouseId,
    salesOrderId: inv.salesOrderId,
    salespersonId: inv.salespersonId,
    subtotal: inv.subtotal,
    taxAmount: inv.taxAmount,
    discountAmount: inv.discountAmount,
    total: inv.total,
    notes: inv.notes,
    invoiceTemplateId: nullable(inv.invoiceTemplateId),
    createdBy: inv.createdBy,
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
    deletedAt: nullable(inv.deletedAt),
    lines:
      lines?.map((l) => ({
        id: l.id,
        productId: l.productId,
        salesOrderLineId: l.salesOrderLineId,
        originalInvoiceLineId: nullable(l.originalInvoiceLineId),
        quantity: l.quantity,
        bonusQuantity: l.bonusQuantity ?? '0',
        unitPrice: l.unitPrice,
        taxAmount: l.taxAmount,
        discountAmount: l.discountAmount,
        taxProfileId: l.taxProfileId,
        batchCode: nullable(l.batchCode),
        expiryDate: toIsoDateString(l.expiryDate) ?? null,
      })) ?? undefined,
  };
}
