import { EntityManager } from 'typeorm';
import { Account, JournalEntry, JournalLine } from '@tradeflow/db';
import { resolveLiquidAccountId } from './companySettings';
import { parseDecimalStrict } from '../utils/decimal';

const ACC = {
  AR: '1200',
  SALES: '4000',
  TAX: '2200',
  INVENTORY: '1300',
  AP: '2100',
  INPUT_VAT: '1500',
  COGS: '5100',
} as const;

async function accountIdByCode(manager: EntityManager, code: string): Promise<string> {
  const row = await manager
    .createQueryBuilder(Account, 'a')
    .where('a.code = :code AND a.branch_id IS NULL', { code })
    .getOne();
  if (!row) throw new Error(`System account ${code} not found. Run migrations.`);
  return row.id;
}

function assertBalanced(lines: Array<{ debit: string; credit: string }>): void {
  let d = 0;
  let c = 0;
  for (const l of lines) {
    d += parseFloat(l.debit || '0');
    c += parseFloat(l.credit || '0');
  }
  if (Math.abs(d - c) > 0.0001) throw new Error('Journal is not balanced');
}

export async function postSalesInvoiceJournal(
  manager: EntityManager,
  params: {
    entryDate: string;
    reference: string;
    description?: string;
    branchId?: string;
    userId?: string;
    invoiceId: string;
    paymentType: string;
    total: string;
    revenueExTax: string;
    taxAmount: string;
    /** Layer-based COGS: Dr COGS, Cr Inventory when > 0 */
    cogsAmount?: string;
  }
): Promise<JournalEntry> {
  const existing = await manager.findOne(JournalEntry, {
    where: { sourceType: 'sales_invoice', sourceId: params.invoiceId },
  });
  if (existing) throw new Error('Invoice already has accounting entry');

  const [arId, salesId, taxId] = await Promise.all([
    accountIdByCode(manager, ACC.AR),
    accountIdByCode(manager, ACC.SALES),
    accountIdByCode(manager, ACC.TAX),
  ]);

  const debitAccountId =
    params.paymentType === 'cash' ? await resolveLiquidAccountId(manager, 'cash') : arId;
  const lines: Array<{ accountId: string; debit: string; credit: string }> = [
    { accountId: debitAccountId, debit: params.total, credit: '0.0000' },
    { accountId: salesId, debit: '0.0000', credit: params.revenueExTax },
  ];
  if (parseFloat(params.taxAmount) > 0.00005) {
    lines.push({ accountId: taxId, debit: '0.0000', credit: params.taxAmount });
  }

  const cogsStr =
    params.cogsAmount && parseFloat(params.cogsAmount) > 0.00005
      ? parseDecimalStrict(params.cogsAmount)
      : null;
  if (cogsStr) {
    const [cogsId, invId] = await Promise.all([
      accountIdByCode(manager, ACC.COGS),
      accountIdByCode(manager, ACC.INVENTORY),
    ]);
    lines.push({ accountId: cogsId, debit: cogsStr, credit: '0.0000' });
    lines.push({ accountId: invId, debit: '0.0000', credit: cogsStr });
  }

  assertBalanced(lines);

  const entry = manager.create(JournalEntry, {
    entryDate: params.entryDate,
    reference: params.reference,
    description: params.description,
    status: 'posted',
    sourceType: 'sales_invoice',
    sourceId: params.invoiceId,
    branchId: params.branchId,
    createdBy: params.userId,
  });
  await manager.save(entry);

  for (const l of lines) {
    await manager.save(
      manager.create(JournalLine, {
        journalEntryId: entry.id,
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
      })
    );
  }

  return entry;
}

export async function postReceiptJournal(
  manager: EntityManager,
  params: {
    entryDate: string;
    reference: string;
    branchId?: string;
    userId?: string;
    receiptId: string;
    amount: string;
    paymentMethod: string;
  }
): Promise<JournalEntry> {
  const existing = await manager.findOne(JournalEntry, {
    where: { sourceType: 'sales_receipt', sourceId: params.receiptId },
  });
  if (existing) throw new Error('Receipt already has accounting entry');

  const [arId, liquidId] = await Promise.all([
    accountIdByCode(manager, ACC.AR),
    resolveLiquidAccountId(manager, params.paymentMethod),
  ]);

  const lines = [
    { accountId: liquidId, debit: params.amount, credit: '0.0000' },
    { accountId: arId, debit: '0.0000', credit: params.amount },
  ];
  assertBalanced(lines);

  const entry = manager.create(JournalEntry, {
    entryDate: params.entryDate,
    reference: params.reference,
    description: 'Customer receipt',
    status: 'posted',
    sourceType: 'sales_receipt',
    sourceId: params.receiptId,
    branchId: params.branchId,
    createdBy: params.userId,
  });
  await manager.save(entry);

  for (const l of lines) {
    await manager.save(
      manager.create(JournalLine, {
        journalEntryId: entry.id,
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
      })
    );
  }

  return entry;
}

/** Purchase invoice: Dr Inventory (net of header discount), Dr Input VAT, Cr Accounts Payable */
export async function postSupplierInvoiceJournal(
  manager: EntityManager,
  params: {
    entryDate: string;
    reference: string;
    description?: string;
    branchId?: string;
    userId?: string;
    supplierInvoiceId: string;
    inventoryAmount: string;
    taxAmount: string;
    total: string;
  }
): Promise<JournalEntry> {
  const existing = await manager.findOne(JournalEntry, {
    where: { sourceType: 'supplier_invoice', sourceId: params.supplierInvoiceId },
  });
  if (existing) throw new Error('Supplier invoice already has accounting entry');

  const [invId, apId, vatId] = await Promise.all([
    accountIdByCode(manager, ACC.INVENTORY),
    accountIdByCode(manager, ACC.AP),
    accountIdByCode(manager, ACC.INPUT_VAT),
  ]);

  const lines: Array<{ accountId: string; debit: string; credit: string }> = [
    { accountId: invId, debit: params.inventoryAmount, credit: '0.0000' },
    { accountId: apId, debit: '0.0000', credit: params.total },
  ];
  if (parseFloat(params.taxAmount) > 0.00005) {
    lines.splice(1, 0, { accountId: vatId, debit: params.taxAmount, credit: '0.0000' });
  }
  assertBalanced(lines);

  const entry = manager.create(JournalEntry, {
    entryDate: params.entryDate,
    reference: params.reference,
    description: params.description,
    status: 'posted',
    sourceType: 'supplier_invoice',
    sourceId: params.supplierInvoiceId,
    branchId: params.branchId,
    createdBy: params.userId,
  });
  await manager.save(entry);

  for (const l of lines) {
    await manager.save(
      manager.create(JournalLine, {
        journalEntryId: entry.id,
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
      })
    );
  }

  return entry;
}

export async function postSupplierPaymentJournal(
  manager: EntityManager,
  params: {
    entryDate: string;
    reference: string;
    branchId?: string;
    userId?: string;
    supplierPaymentId: string;
    amount: string;
    paymentMethod: string;
  }
): Promise<JournalEntry> {
  const existing = await manager.findOne(JournalEntry, {
    where: { sourceType: 'supplier_payment', sourceId: params.supplierPaymentId },
  });
  if (existing) throw new Error('Supplier payment already has accounting entry');

  const [apId, liquidId] = await Promise.all([
    accountIdByCode(manager, ACC.AP),
    resolveLiquidAccountId(manager, params.paymentMethod),
  ]);

  const payLines = [
    { accountId: apId, debit: params.amount, credit: '0.0000' },
    { accountId: liquidId, debit: '0.0000', credit: params.amount },
  ];
  assertBalanced(payLines);

  const entry = manager.create(JournalEntry, {
    entryDate: params.entryDate,
    reference: params.reference,
    description: 'Supplier payment',
    status: 'posted',
    sourceType: 'supplier_payment',
    sourceId: params.supplierPaymentId,
    branchId: params.branchId,
    createdBy: params.userId,
  });
  await manager.save(entry);

  for (const l of payLines) {
    await manager.save(
      manager.create(JournalLine, {
        journalEntryId: entry.id,
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
      })
    );
  }

  return entry;
}
