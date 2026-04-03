import { EntityManager, IsNull } from 'typeorm';
import { Customer, InventoryMovement, Invoice, SalesOrderLine } from '@tradeflow/db';
import { applyMovement, assertProductInScope, assertWarehouseInScope, runInTransaction } from './inventoryService';
import { decimalAdd } from '../utils/decimal';
import { moneyCmp, moneySub } from '../utils/money';
import { getCustomerCreditExposure, getInvoiceAmountAllocated } from './salesCustomerBalance';
import { postSalesInvoiceJournal } from './accountingPosting';
import { addDaysIso } from './salesTotals';
import { assertDateNotPeriodLocked } from './periodLock';

export async function postInvoice(
  invoiceId: string,
  userId: string | undefined,
  branchId: string | undefined
): Promise<Invoice> {
  return runInTransaction(async (manager) => {
    const inv = await manager.findOne(Invoice, {
      where: { id: invoiceId, deletedAt: IsNull() },
      relations: ['lines'],
    });
    if (!inv) throw new Error('Invoice not found');
    if (inv.status !== 'draft') throw new Error('Only draft invoices can be posted');
    if (!inv.lines?.length) throw new Error('Invoice has no lines');

    await assertDateNotPeriodLocked(manager, inv.invoiceDate);

    await assertWarehouseInScope(inv.warehouseId, branchId);
    for (const line of inv.lines) {
      await assertProductInScope(line.productId, branchId);
    }

    if (inv.paymentType === 'credit') {
      const customer = await manager.findOne(Customer, {
        where: { id: inv.customerId, deletedAt: IsNull() },
      });
      if (!customer) throw new Error('Customer not found');
      const limit = parseFloat(customer.creditLimit || '0');
      if (limit > 0) {
        const exposure = await getCustomerCreditExposure(manager, inv.customerId);
        const projected = parseFloat(exposure) + parseFloat(inv.total);
        if (projected > limit + 1e-6) {
          throw new Error(
            `Credit limit exceeded: outstanding plus this invoice is ${projected.toFixed(2)}, limit ${limit.toFixed(2)}`
          );
        }
      }
    }

    const movementDate = inv.invoiceDate;

    for (const line of inv.lines) {
      const q = parseFloat(line.quantity);
      if (q <= 0) continue;
      const delta = (-q).toFixed(4);
      await applyMovement(manager, {
        productId: line.productId,
        warehouseId: inv.warehouseId,
        quantityDelta: delta,
        refType: 'sale',
        refId: inv.id,
        movementDate,
        branchId: inv.branchId ?? branchId,
        notes: `Invoice ${inv.id}`,
        userId,
        invoiceLineId: line.id,
      });
    }

    for (const line of inv.lines) {
      if (!line.salesOrderLineId) continue;
      const sol = await manager.findOne(SalesOrderLine, {
        where: { id: line.salesOrderLineId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sol) throw new Error('Sales order line not found');
      const newDelivered = decimalAdd(sol.deliveredQuantity, line.quantity);
      if (parseFloat(newDelivered) > parseFloat(sol.quantity) + 1e-9) {
        throw new Error('Invoice quantity exceeds remaining on sales order line');
      }
      sol.deliveredQuantity = newDelivered;
      await manager.save(sol);
    }

    const movs = await manager.find(InventoryMovement, {
      where: { refId: inv.id, refType: 'sale' },
    });
    let cogsTotal = 0;
    for (const m of movs) {
      const q = Math.abs(parseFloat(m.quantityDelta));
      cogsTotal += q * parseFloat(m.unitCost || '0');
    }
    const cogsAmount = cogsTotal.toFixed(4);

    const revenueExTax = moneySub(inv.subtotal, inv.discountAmount);
    await postSalesInvoiceJournal(manager, {
      entryDate: inv.invoiceDate,
      reference: `INV-${inv.id.slice(0, 8)}`,
      description: 'Posted sales invoice',
      branchId: inv.branchId ?? branchId,
      userId,
      invoiceId: inv.id,
      paymentType: inv.paymentType,
      total: inv.total,
      revenueExTax,
      taxAmount: inv.taxAmount,
      cogsAmount,
    });

    inv.status = 'posted';
    await manager.save(inv);
    return inv;
  });
}

/** Resolve due date when omitted on create. */
export async function resolveInvoiceDueDate(
  manager: EntityManager,
  customerId: string,
  invoiceDate: string,
  paymentType: string,
  explicitDue?: string | null
): Promise<string> {
  if (explicitDue) return explicitDue;
  if (paymentType === 'cash') return invoiceDate;
  const customer = await manager.findOne(Customer, {
    where: { id: customerId, deletedAt: IsNull() },
    relations: ['paymentTerms'],
  });
  const netDays = customer?.paymentTerms?.netDays ?? 0;
  return addDaysIso(invoiceDate, netDays);
}

/** Validate receipt allocations against open invoice balances. */
export async function validateReceiptAllocations(
  manager: EntityManager,
  customerId: string,
  allocations: Array<{ invoiceId: string; amount: string }>
): Promise<void> {
  let sum = 0;
  for (const a of allocations) {
    sum += parseFloat(a.amount);
    const inv = await manager.findOne(Invoice, { where: { id: a.invoiceId, deletedAt: IsNull() } });
    if (!inv) throw new Error(`Invoice ${a.invoiceId} not found`);
    if (inv.customerId !== customerId) throw new Error('Invoice belongs to another customer');
    if (inv.status !== 'posted') throw new Error('Can only allocate to posted invoices');
    if (inv.paymentType !== 'credit') throw new Error('Can only allocate to credit invoices');
    const open = moneySub(inv.total, await getInvoiceAmountAllocated(manager, inv.id));
    if (moneyCmp(a.amount, open) > 0) throw new Error(`Allocation exceeds open balance on invoice ${inv.id}`);
  }
  if (allocations.length === 0) throw new Error('At least one allocation is required');
}
