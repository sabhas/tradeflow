import { EntityManager } from 'typeorm';
import { Account, JournalEntry, JournalLine } from '@tradeflow/db';
import { resolveLiquidAccountId } from './companySettings';
import { parseDecimalStrict } from '../utils/decimal';
import { GL_ACCOUNT_CODES } from '../constants/glAccounts';

/**
 * GL posting uses control trade receivable / payable (1100 / 2000). Party detail is in
 * invoices, receipts, payments, and aging — not separate COA codes per customer/supplier.
 */
const ACC = {
  AR: GL_ACCOUNT_CODES.AR_TRADE,
  SALES: GL_ACCOUNT_CODES.SALES,
  TAX: GL_ACCOUNT_CODES.TAX_PAYABLE,
  INVENTORY: GL_ACCOUNT_CODES.INVENTORY,
  AP: GL_ACCOUNT_CODES.AP_TRADE,
  ACCRUED_PURCHASES: GL_ACCOUNT_CODES.ACCRUED_PURCHASES,
  INPUT_VAT: GL_ACCOUNT_CODES.INPUT_VAT,
  COGS: GL_ACCOUNT_CODES.COGS,
} as const;

async function accountIdByCode(manager: EntityManager, code: string): Promise<string> {
  const row = await manager.findOne(Account, { where: { code } });
  if (!row) throw new Error(`GL account with code ${code} not found. Seed or configure chart of accounts.`);
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

  const [salesId, taxId, arId] = await Promise.all([
    accountIdByCode(manager, ACC.SALES),
    accountIdByCode(manager, ACC.TAX),
    accountIdByCode(manager, ACC.AR),
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

  const [liquidId, arId] = await Promise.all([
    resolveLiquidAccountId(manager, params.paymentMethod),
    accountIdByCode(manager, ACC.AR),
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
    baseDebitAccountCode?: string;
  }
): Promise<JournalEntry> {
  const existing = await manager.findOne(JournalEntry, {
    where: { sourceType: 'supplier_invoice', sourceId: params.supplierInvoiceId },
  });
  if (existing) throw new Error('Supplier invoice already has accounting entry');

  const [baseDebitId, vatId, apId] = await Promise.all([
    accountIdByCode(manager, params.baseDebitAccountCode ?? ACC.INVENTORY),
    accountIdByCode(manager, ACC.INPUT_VAT),
    accountIdByCode(manager, ACC.AP),
  ]);

  const lines: Array<{ accountId: string; debit: string; credit: string }> = [
    { accountId: baseDebitId, debit: params.inventoryAmount, credit: '0.0000' },
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

export async function postGrnJournal(
  manager: EntityManager,
  params: {
    entryDate: string;
    reference: string;
    description?: string;
    userId?: string;
    grnId: string;
    total: string;
  }
): Promise<JournalEntry> {
  const existing = await manager.findOne(JournalEntry, {
    where: { sourceType: 'grn_posting', sourceId: params.grnId },
  });
  if (existing) throw new Error('GRN already has accounting entry');

  const [inventoryId, accruedPurchasesId] = await Promise.all([
    accountIdByCode(manager, ACC.INVENTORY),
    accountIdByCode(manager, ACC.ACCRUED_PURCHASES),
  ]);

  const lines = [
    { accountId: inventoryId, debit: params.total, credit: '0.0000' },
    { accountId: accruedPurchasesId, debit: '0.0000', credit: params.total },
  ];
  assertBalanced(lines);

  const entry = manager.create(JournalEntry, {
    entryDate: params.entryDate,
    reference: params.reference,
    description: params.description,
    status: 'posted',
    sourceType: 'grn_posting',
    sourceId: params.grnId,
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

  const [liquidId, apId] = await Promise.all([
    resolveLiquidAccountId(manager, params.paymentMethod),
    accountIdByCode(manager, ACC.AP),
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
