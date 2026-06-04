import { PaymentTerms } from '@tradeflow/db';

export function serializePaymentTerms(p: PaymentTerms) {
  return {
    id: p.id,
    name: p.name,
    netDays: p.netDays,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
