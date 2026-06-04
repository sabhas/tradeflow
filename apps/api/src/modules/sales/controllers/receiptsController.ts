import type { Request } from 'express';
import type { z } from 'zod';
import { createReceiptSchema } from '@tradeflow/shared';
import { Receipt, ReceiptAllocation } from '@tradeflow/db';
import { getPagination } from '../../../shared/utils/pagination';
import { created, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';
import { createReceipt as createReceiptService } from '../services/receiptService';

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
  const qb = Receipt.createQueryBuilder('r').orderBy('r.receipt_date', 'DESC').take(limit).skip(offset);
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
  const saved = await createReceiptService(body, req.auth?.userId);
  return created({ data: serialize(saved, saved.allocations) });
}
