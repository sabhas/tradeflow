import type { Request } from 'express';
import type { z } from 'zod';
import { listApprovalsQuerySchema } from '@tradeflow/shared';
import { ApprovalRequest } from '@tradeflow/db';
import { getValidatedQuery } from '../../../shared/middleware/validate';
import { getPagination } from '../../../shared/utils/pagination';
import { ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';
import { serializeApprovalRequest } from '../serializers/approval.serializer';

export type ReviewBody = {
  note?: string;
};

export async function listApprovalRequests(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof listApprovalsQuerySchema>>(req);
  const status = q.status ?? 'pending';
  const { limit, offset } = getPagination(req);

  const qb = ApprovalRequest.createQueryBuilder('a')
    .where('1=1')
    .orderBy('a.created_at', 'DESC')
    .take(limit)
    .skip(offset);
  qb.andWhere('a.status = :st', { st: status });

  const [rows, total] = await qb.getManyAndCount();
  return ok({ data: rows.map(serializeApprovalRequest), meta: { total, limit, offset } });
}

export async function approveApprovalRequest(req: Request, body: ReviewBody): Promise<ControllerResult> {
  const row = await ApprovalRequest.findOne({
    where: { id: req.params.id },
  });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (row.status !== 'pending') {
    throw new HttpError(400, { error: 'Request is not pending' });
  }
  row.status = 'approved';
  row.reviewedBy = req.auth?.userId;
  row.reviewNote = body.note ?? undefined;
  row.reviewedAt = new Date();
  await ApprovalRequest.save(row);
  return ok({ data: serializeApprovalRequest(row) });
}

export async function rejectApprovalRequest(req: Request, body: ReviewBody): Promise<ControllerResult> {
  const row = await ApprovalRequest.findOne({
    where: { id: req.params.id },
  });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (row.status !== 'pending') {
    throw new HttpError(400, { error: 'Request is not pending' });
  }
  row.status = 'rejected';
  row.reviewedBy = req.auth?.userId;
  row.reviewNote = body.note ?? undefined;
  row.reviewedAt = new Date();
  await ApprovalRequest.save(row);
  return ok({ data: serializeApprovalRequest(row) });
}
