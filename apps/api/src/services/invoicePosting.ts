import { EntityManager, IsNull } from 'typeorm';
import { Customer, InventoryMovement, Invoice, InvoiceLine, Product, SalesOrderLine } from '@tradeflow/db';
import { applyMovement, assertProductInScope, assertWarehouseInScope, runInTransaction } from './inventoryService';
import { decimalAdd, decimalSub, parseDecimalStrict } from '../utils/decimal';
import { moneyCmp, moneySub } from '../utils/money';
import { getCustomerCreditExposure, getInvoiceAmountAllocated } from './salesCustomerBalance';
import { postSalesCreditNoteJournal, postSalesInvoiceJournal } from './accountingPosting';
import { addDaysIso } from './salesTotals';
import { assertDateNotPeriodLocked } from './periodLock';

async function getQtyReturnedAgainstOriginalLine(
  manager: EntityManager,
  originalInvoiceLineId: string,
  excludeInvoiceId?: string
): Promise<number> {
  const params: string[] = [originalInvoiceLineId];
  let extra = '';
  if (excludeInvoiceId) {
    params.push(excludeInvoiceId);
    extra = ' AND i.id <> $2';
  }
  const rows = await manager.query(
    `SELECT COALESCE(SUM(il.quantity::numeric), 0)::text AS s
     FROM invoice_lines il
     INNER JOIN invoices i ON i.id = il.invoice_id AND i.deleted_at IS NULL
     WHERE il.original_invoice_line_id = $1
       AND i.document_kind = 'credit_note'
       AND i.status = 'posted'${extra}`,
    params
  );
  return parseFloat(rows[0]?.s ?? '0');
}

async function assertCreditNoteReadyToPost(manager: EntityManager, inv: Invoice): Promise<void> {
  if (inv.documentKind !== 'credit_note') return;
  if (!inv.originalInvoiceId) throw new Error('Credit note requires original invoice');
  const orig = await manager.findOne(Invoice, {
    where: { id: inv.originalInvoiceId, deletedAt: IsNull() },
    relations: ['lines'],
  });
  if (!orig) throw new Error('Original invoice not found');
  if (orig.status !== 'posted') throw new Error('Original invoice must be posted');
  if (orig.documentKind === 'credit_note') throw new Error('Cannot credit against another credit note');
  if (orig.customerId !== inv.customerId) throw new Error('Customer must match original invoice');
  if (orig.warehouseId !== inv.warehouseId) throw new Error('Warehouse must match original invoice (return to same site)');

  const origLinesById = new Map((orig.lines ?? []).map((l) => [l.id, l]));

  for (const line of inv.lines ?? []) {
    if (!line.originalInvoiceLineId) throw new Error('Each credit note line must reference an original invoice line');
    const ol = origLinesById.get(line.originalInvoiceLineId);
    if (!ol) throw new Error('Original invoice line not on referenced invoice');
    if (ol.productId !== line.productId) throw new Error('Product must match original invoice line');
    const ret = parseFloat(line.quantity);
    if (ret <= 0) continue;
    const already = await getQtyReturnedAgainstOriginalLine(manager, line.originalInvoiceLineId, inv.id);
    const maxRet = parseFloat(ol.quantity);
    if (already + ret > maxRet + 1e-6) {
      throw new Error('Return quantity exceeds original invoice line (including prior credit notes)');
    }
  }
}

async function resolveReturnUnitCost(manager: EntityManager, line: InvoiceLine): Promise<string> {
  const oid = line.originalInvoiceLineId;
  if (!oid) {
    const p = await manager.findOne(Product, { where: { id: line.productId } });
    return parseDecimalStrict(String(p?.costPrice ?? '0'));
  }
  const rows = await manager.query(
    `SELECT unit_cost::text AS uc FROM inventory_movements
     WHERE invoice_line_id = $1 AND ref_type = 'sale' LIMIT 1`,
    [oid]
  );
  const uc = rows[0]?.uc;
  if (uc != null && String(uc).trim() !== '') {
    return parseDecimalStrict(String(uc));
  }
  const p = await manager.findOne(Product, { where: { id: line.productId } });
  return parseDecimalStrict(String(p?.costPrice ?? '0'));
}

export async function postInvoice(invoiceId: string, userId: string | undefined): Promise<Invoice> {
  return runInTransaction(async (manager) => {
    const inv = await manager.findOne(Invoice, {
      where: { id: invoiceId, deletedAt: IsNull() },
      relations: ['lines'],
    });
    if (!inv) throw new Error('Invoice not found');
    if (inv.status !== 'draft') throw new Error('Only draft invoices can be posted');
    if (!inv.lines?.length) throw new Error('Invoice has no lines');

    await assertDateNotPeriodLocked(manager, inv.invoiceDate);

    await assertWarehouseInScope(inv.warehouseId, undefined);
    for (const line of inv.lines) {
      await assertProductInScope(line.productId, undefined);
    }

    const isCredit = inv.documentKind === 'credit_note';

    if (isCredit) {
      await assertCreditNoteReadyToPost(manager, inv);
    } else if (inv.paymentType === 'credit') {
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

    if (!isCredit) {
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
    } else {
      for (const line of inv.lines) {
        const q = parseFloat(line.quantity);
        if (q <= 0) continue;
        const uc = await resolveReturnUnitCost(manager, line);
        await applyMovement(manager, {
          productId: line.productId,
          warehouseId: inv.warehouseId,
          quantityDelta: q.toFixed(4),
          refType: 'sale_return',
          refId: inv.id,
          unitCost: uc,
          movementDate,
          notes: `Credit note ${inv.id}`,
          userId,
          invoiceLineId: line.id,
        });
      }

      for (const line of inv.lines) {
        if (!line.originalInvoiceLineId) continue;
        const origLine = await manager.findOne(InvoiceLine, { where: { id: line.originalInvoiceLineId } });
        if (!origLine?.salesOrderLineId) continue;
        const sol = await manager.findOne(SalesOrderLine, {
          where: { id: origLine.salesOrderLineId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!sol) throw new Error('Sales order line not found');
        const newDelivered = decimalSub(sol.deliveredQuantity, line.quantity);
        if (parseFloat(newDelivered) < -1e-9) {
          throw new Error('Credit note would reduce delivered quantity below zero');
        }
        sol.deliveredQuantity = newDelivered;
        await manager.save(sol);
      }
    }

    const refType = isCredit ? 'sale_return' : 'sale';
    const movs = await manager.find(InventoryMovement, {
      where: { refId: inv.id, refType },
    });
    let cogsTotal = 0;
    for (const m of movs) {
      const q = Math.abs(parseFloat(m.quantityDelta));
      cogsTotal += q * parseFloat(m.unitCost || '0');
    }
    const cogsAmount = cogsTotal.toFixed(4);

    const revenueExTax = moneySub(inv.subtotal, inv.discountAmount);
    if (!isCredit) {
      await postSalesInvoiceJournal(manager, {
        entryDate: inv.invoiceDate,
        reference: `INV-${inv.id.slice(0, 8)}`,
        description: 'Posted sales invoice',
        userId,
        invoiceId: inv.id,
        paymentType: inv.paymentType,
        total: inv.total,
        revenueExTax,
        taxAmount: inv.taxAmount,
        cogsAmount,
      });
    } else {
      await postSalesCreditNoteJournal(manager, {
        entryDate: inv.invoiceDate,
        reference: `CN-${inv.id.slice(0, 8)}`,
        description: 'Posted sales credit note',
        userId,
        creditNoteInvoiceId: inv.id,
        paymentType: inv.paymentType,
        total: inv.total,
        revenueExTax,
        taxAmount: inv.taxAmount,
        cogsAmount,
      });
    }

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
    if (inv.documentKind === 'credit_note') throw new Error('Cannot allocate receipts to credit notes');
    const open = moneySub(inv.total, await getInvoiceAmountAllocated(manager, inv.id));
    if (moneyCmp(a.amount, open) > 0) throw new Error(`Allocation exceeds open balance on invoice ${inv.id}`);
  }
  if (allocations.length === 0) throw new Error('At least one allocation is required');
}
