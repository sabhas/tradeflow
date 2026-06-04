import type { Request } from 'express';
import type { z } from 'zod';
import { createReceiptSchema, listReceiptsQuerySchema } from '@tradeflow/shared';
import { Receipt, ReceiptAllocation } from '@tradeflow/db';
import { getValidatedQuery } from '../../../shared/middleware/validate';
import { getPaginationFromQuery } from '../../../shared/utils/pagination';
import { created, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';
import { createReceipt as createReceiptService } from '../services/receiptService';
import { serializeReceipt } from '../serializers/receipt.serializer';

type CreateReceiptInput = z.infer<typeof createReceiptSchema>;

type ListReceiptsQuery = z.infer<typeof listReceiptsQuerySchema>;

export async function listReceipts(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<ListReceiptsQuery>(req);
  const { limit, offset } = getPaginationFromQuery(q);
  const qb = Receipt.createQueryBuilder('r').orderBy('r.receipt_date', 'DESC').take(limit).skip(offset);
  if (q.customerId) qb.andWhere('r.customer_id = :cid', { cid: q.customerId });
  if (q.dateFrom) qb.andWhere('r.receipt_date >= :df', { df: q.dateFrom });
  if (q.dateTo) qb.andWhere('r.receipt_date <= :dt', { dt: q.dateTo });
  const [rows, total] = await qb.getManyAndCount();
  return ok({ data: rows.map((r) => serializeReceipt(r)), meta: { total, limit, offset } });
}

export async function getReceipt(req: Request): Promise<ControllerResult> {
  const row = await Receipt.findOne({
    where: { id: req.params.id },
    relations: ['allocations'],
  });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  return ok({ data: serializeReceipt(row, row.allocations) });
}

export async function createReceipt(req: Request, body: CreateReceiptInput): Promise<ControllerResult> {
  let allocSum = 0;
  for (const a of body.allocations) allocSum += parseFloat(a.amount);
  if (Math.abs(allocSum - parseFloat(body.amount)) > 0.0001) {
    throw new HttpError(400, { error: 'Allocations must sum to receipt amount' });
  }
  const saved = await createReceiptService(body, req.auth?.userId);
  return created({ data: serializeReceipt(saved, saved.allocations) });
}
