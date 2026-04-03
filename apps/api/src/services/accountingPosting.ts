import { EntityManager } from 'typeorm';
import { Account, JournalEntry, JournalLine } from '@tradeflow/db';
const ACC = {
  AR: '1200',
  CASH: '1000',
  SALES: '4000',
  TAX: '2200',
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
  }
): Promise<JournalEntry> {
  const existing = await manager.findOne(JournalEntry, {
    where: { sourceType: 'sales_invoice', sourceId: params.invoiceId },
  });
  if (existing) throw new Error('Invoice already has accounting entry');

  const [arId, cashId, salesId, taxId] = await Promise.all([
    accountIdByCode(manager, ACC.AR),
    accountIdByCode(manager, ACC.CASH),
    accountIdByCode(manager, ACC.SALES),
    accountIdByCode(manager, ACC.TAX),
  ]);

  const debitAccountId = params.paymentType === 'cash' ? cashId : arId;
  const lines: Array<{ accountId: string; debit: string; credit: string }> = [
    { accountId: debitAccountId, debit: params.total, credit: '0.0000' },
    { accountId: salesId, debit: '0.0000', credit: params.revenueExTax },
  ];
  if (parseFloat(params.taxAmount) > 0.00005) {
    lines.push({ accountId: taxId, debit: '0.0000', credit: params.taxAmount });
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
  }
): Promise<JournalEntry> {
  const existing = await manager.findOne(JournalEntry, {
    where: { sourceType: 'sales_receipt', sourceId: params.receiptId },
  });
  if (existing) throw new Error('Receipt already has accounting entry');

  const [arId, cashId] = await Promise.all([
    accountIdByCode(manager, ACC.AR),
    accountIdByCode(manager, ACC.CASH),
  ]);

  const lines = [
    { accountId: cashId, debit: params.amount, credit: '0.0000' },
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
