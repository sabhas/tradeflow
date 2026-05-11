import type { EntityManager } from 'typeorm';
import { IsNull, Not } from 'typeorm';
import { Invoice, SalesOrder } from '@tradeflow/db';
import { HttpError } from '../utils/httpError';

/** Sales orders must be confirmed before they can be linked to an invoice (convert or manual link). */
export async function assertSalesOrderConfirmedForInvoice(
  manager: EntityManager,
  salesOrderId: string | undefined | null
): Promise<void> {
  if (!salesOrderId) return;
  const o = await manager.findOne(SalesOrder, { where: { id: salesOrderId } });
  if (!o) throw new HttpError(404, { error: 'Sales order not found' });
  if (o.status !== 'confirmed') {
    throw new HttpError(400, {
      error: 'Only confirmed sales orders can be linked to an invoice',
    });
  }
}

/** At most one active (non-deleted) invoice may reference a sales order. */
export async function assertNoOtherInvoiceForSalesOrder(
  manager: EntityManager,
  salesOrderId: string | undefined | null,
  excludeInvoiceId?: string
): Promise<void> {
  if (!salesOrderId) return;
  const count = await manager.count(Invoice, {
    where: {
      salesOrderId,
      deletedAt: IsNull(),
      ...(excludeInvoiceId ? { id: Not(excludeInvoiceId) } : {}),
    },
  });
  if (count > 0) {
    throw new HttpError(400, {
      error: 'An invoice already exists for this sales order',
    });
  }
}
