import { EntityManager } from 'typeorm';
import { SupplierInvoice } from '@tradeflow/db';
import { moneyCmp } from '../utils/money';

export async function getSupplierInvoiceAmountAllocated(
  manager: EntityManager,
  supplierInvoiceId: string
): Promise<string> {
  const rows = await manager.query(
    `SELECT COALESCE(SUM(amount), 0)::text as s FROM supplier_payment_allocations WHERE supplier_invoice_id = $1`,
    [supplierInvoiceId]
  );
  return rows[0]?.s ?? '0.0000';
}

export async function validateSupplierPaymentAllocations(
  manager: EntityManager,
  supplierId: string,
  allocations: Array<{ supplierInvoiceId: string; amount: string }>
): Promise<void> {
  for (const a of allocations) {
    const inv = await manager.findOne(SupplierInvoice, { where: { id: a.supplierInvoiceId } });
    if (!inv) throw new Error(`Supplier invoice ${a.supplierInvoiceId} not found`);
    if (inv.supplierId !== supplierId) throw new Error('Invoice does not belong to this supplier');
    if (inv.status !== 'posted') throw new Error('Can only allocate to posted supplier invoices');
    const alloc = await getSupplierInvoiceAmountAllocated(manager, a.supplierInvoiceId);
    const open = (parseFloat(inv.total) - parseFloat(alloc)).toFixed(4);
    if (moneyCmp(a.amount, open) > 0) throw new Error(`Allocation exceeds open balance on invoice ${inv.id}`);
  }
  if (allocations.length === 0) throw new Error('At least one allocation required');
}
