import { InvoiceTemplate } from '@tradeflow/db';

export function serializeInvoiceTemplate(t: InvoiceTemplate) {
  return {
    id: t.id,
    name: t.name,
    config: t.config,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}
