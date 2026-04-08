import type { Request } from 'express';
import type { z } from 'zod';
import { createReceiptSchema } from '@tradeflow/shared';
import { Receipt, ReceiptAllocation } from '@tradeflow/db';
import { getPagination } from '../utils/pagination';
import { runInTransaction } from '../services/inventoryService';
import { validateReceiptAllocations } from '../services/invoicePosting';
import { postReceiptJournal } from '../services/accountingPosting';
import { assertDateNotPeriodLocked } from '../services/periodLock';
import { created, ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

type CreateReceiptInput = z.infer<typeof createReceiptSchema>;

function serialize(r: Receipt, allocations?: ReceiptAllocation[]) {
  return {
    id: r.id,
    customerId: r.customerId,
    receiptDate: r.receiptDate,
    amount: r.amount,
    paymentMethod: r.paymentMethod,
    reference: r.reference,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    allocations:
      allocations?.map((a) => ({
        id: a.id,
        invoiceId: a.invoiceId,
        amount: a.amount,
      })) ?? undefined,
  };
}

export async function listReceipts(req: Request): Promise<ControllerResult> {
  const { limit, offset } = getPagination(req);
  const qb = Receipt
    .createQueryBuilder('r')
    .orderBy('r.receipt_date', 'DESC')
    .take(limit)
    .skip(offset);
  if (req.query.customerId) qb.andWhere('r.customer_id = :cid', { cid: req.query.customerId });
  if (req.query.dateFrom) qb.andWhere('r.receipt_date >= :df', { df: req.query.dateFrom });
  if (req.query.dateTo) qb.andWhere('r.receipt_date <= :dt', { dt: req.query.dateTo });
  const [rows, total] = await qb.getManyAndCount();
  return ok({ data: rows.map((r) => serialize(r)), meta: { total, limit, offset } });
}

export async function getReceipt(req: Request): Promise<ControllerResult> {
  const row = await Receipt.findOne({
    where: { id: req.params.id },
    relations: ['allocations'],
  });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  return ok({ data: serialize(row, row.allocations) });
}

export async function createReceipt(req: Request, body: CreateReceiptInput): Promise<ControllerResult> {
  let allocSum = 0;
  for (const a of body.allocations) allocSum += parseFloat(a.amount);
  if (Math.abs(allocSum - parseFloat(body.amount)) > 0.0001) {
    throw new HttpError(400, { error: 'Allocations must sum to receipt amount' });
  }
  try {
    const saved = await runInTransaction(async (manager) => {
      await validateReceiptAllocations(manager, body.customerId, body.allocations);
      const rec = manager.create(Receipt, {
        customerId: body.customerId,
        receiptDate: body.receiptDate.slice(0, 10),
        amount: body.amount,
        paymentMethod: body.paymentMethod,
        reference: body.reference ?? undefined,
        createdBy: req.auth?.userId,
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
        userId: req.auth?.userId,
        receiptId: rec.id,
        amount: rec.amount,
        paymentMethod: rec.paymentMethod,
      });
      return manager.findOneOrFail(Receipt, { where: { id: rec.id }, relations: ['allocations'] });
    });
    return created({ data: serialize(saved, saved.allocations) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, { error: (e as Error).message });
  }
}
