import type { z } from 'zod';
import { createReceiptSchema } from '@tradeflow/shared';
import { Receipt, ReceiptAllocation } from '@tradeflow/db';
import { runInTransaction } from '../../inventory/services/inventoryService';
import { validateReceiptAllocations } from './invoicePosting';
import { postReceiptJournal } from '../../accounting/services/accountingPosting';
import { assertDateNotPeriodLocked } from '../../accounting/services/periodLock';

type CreateReceiptInput = z.infer<typeof createReceiptSchema>;

export async function createReceipt(body: CreateReceiptInput, userId: string | undefined): Promise<Receipt> {
  return runInTransaction(async (manager) => {
    await validateReceiptAllocations(manager, body.customerId, body.allocations);
    const rec = manager.create(Receipt, {
      customerId: body.customerId,
      receiptDate: body.receiptDate.slice(0, 10),
      amount: body.amount,
      paymentMethod: body.paymentMethod,
      reference: body.reference ?? undefined,
      createdBy: userId,
    });
    await manager.save(rec);
    for (const a of body.allocations) {
      await manager.save(
        manager.create(ReceiptAllocation, {
          receiptId: rec.id,
          invoiceId: a.invoiceId,
          amount: a.amount,
        })
      );
    }
    await assertDateNotPeriodLocked(manager, rec.receiptDate);
    await postReceiptJournal(manager, {
      entryDate: rec.receiptDate,
      reference: `RCPT-${rec.id.slice(0, 8)}`,
      userId,
      receiptId: rec.id,
      amount: rec.amount,
      paymentMethod: rec.paymentMethod,
    });
    return manager.findOneOrFail(Receipt, { where: { id: rec.id }, relations: ['allocations'] });
  });
}
