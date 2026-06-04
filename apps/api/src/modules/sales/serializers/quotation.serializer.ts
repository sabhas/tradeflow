import { Quotation, QuotationLine } from '@tradeflow/db';

export function serializeQuotation(q: Quotation, lines?: QuotationLine[]) {
  return {
    id: q.id,
    customerId: q.customerId,
    quotationDate: q.quotationDate,
    validUntil: q.validUntil,
    status: q.status,
    subtotal: q.subtotal,
    taxAmount: q.taxAmount,
    discountAmount: q.discountAmount,
    total: q.total,
    notes: q.notes,
    createdBy: q.createdBy,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    lines:
      lines?.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxAmount: l.taxAmount,
        discountAmount: l.discountAmount,
        taxProfileId: l.taxProfileId,
      })) ?? undefined,
  };
}
