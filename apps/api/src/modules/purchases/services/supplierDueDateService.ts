import { IsNull, type EntityManager } from 'typeorm';
import { Supplier } from '@tradeflow/db';
import { addDaysIso } from '../../sales/services/salesTotals';

const DEFAULT_DUE_DAYS = 30;

/** Supplier due date; defaults to 30 days until supplier payment terms are modeled on Supplier. */
export async function resolveSupplierDueDate(
  manager: EntityManager,
  supplierId: string,
  invoiceDate: string
): Promise<string> {
  const s = await manager.findOne(Supplier, {
    where: { id: supplierId, deletedAt: IsNull() },
  });
  if (!s) throw new Error('Supplier not found');
  return addDaysIso(invoiceDate, DEFAULT_DUE_DAYS);
}
