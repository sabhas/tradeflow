import { SupplierPayment, SupplierPaymentAllocation } from '@tradeflow/db';
import { nullable } from '../../../shared/utils/serializeHelpers';

export function serializeSupplierPayment(p: SupplierPayment, allocations?: SupplierPaymentAllocation[]) {
  return {
    id: p.id,
    supplierId: p.supplierId,
    paymentDate: p.paymentDate,
    amount: p.amount,
    paymentMethod: p.paymentMethod,
    reference: nullable(p.reference),
    createdBy: nullable(p.createdBy),
    createdAt: p.createdAt,
    supplier: p.supplier ? { id: p.supplier.id, name: p.supplier.name } : undefined,
    allocations:
      allocations?.map((a) => ({
        id: a.id,
        supplierInvoiceId: a.supplierInvoiceId,
        amount: a.amount,
      })) ?? undefined,
  };
}
