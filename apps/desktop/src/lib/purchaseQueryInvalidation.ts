import type { QueryClient } from '@tanstack/react-query';

/** Badge on Purchases → Supplier invoices (GRNs awaiting / draft invoice). */
export const pendingSupplierInvoiceCountKey = ['grns', 'pending-invoice-count'] as const;

export function invalidateGrnInvoiceSignals(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: pendingSupplierInvoiceCountKey });
  void qc.invalidateQueries({ queryKey: ['grns'] });
}
