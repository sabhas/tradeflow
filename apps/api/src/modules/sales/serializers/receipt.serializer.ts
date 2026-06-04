import { Receipt, ReceiptAllocation } from '@tradeflow/db';

export function serializeReceipt(r: Receipt, allocations?: ReceiptAllocation[]) {
  return {
    id: r.id,
    customerId: r.customerId,
    receiptDate: r.receiptDate,
    amount: r.amount,
    paymentMethod: r.paymentMethod,
    reference: r.reference,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    allocations:
      allocations?.map((a) => ({
        id: a.id,
        invoiceId: a.invoiceId,
        amount: a.amount,
      })) ?? undefined,
  };
}
