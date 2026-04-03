import { EntityManager } from 'typeorm';
import { moneySub } from '../utils/money';

/** Posted credit invoices total minus allocations applied to those invoices (same customer). */
export async function getCustomerCreditExposure(manager: EntityManager, customerId: string): Promise<string> {
  const inv = await manager.query(
    `SELECT COALESCE(SUM(i.total), 0)::text as s FROM invoices i
     WHERE i.customer_id = $1 AND i.status = $2 AND i.payment_type = $3
       AND i.deleted_at IS NULL`,
    [customerId, 'posted', 'credit']
  );
  const allocated = await manager.query(
    `SELECT COALESCE(SUM(ra.amount), 0)::text as s
     FROM receipt_allocations ra
     INNER JOIN invoices i ON i.id = ra.invoice_id AND i.deleted_at IS NULL
     WHERE i.customer_id = $1 AND i.status = $2 AND i.payment_type = $3`,
    [customerId, 'posted', 'credit']
  );
  const gross = inv[0]?.s ?? '0';
  const alloc = allocated[0]?.s ?? '0';
  return moneySub(gross, alloc);
}

export async function getInvoiceAmountAllocated(manager: EntityManager, invoiceId: string): Promise<string> {
  const rows = await manager.query(
    `SELECT COALESCE(SUM(amount), 0)::text as s FROM receipt_allocations WHERE invoice_id = $1`,
    [invoiceId]
  );
  return rows[0]?.s ?? '0.0000';
}
