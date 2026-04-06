import type { Request } from 'express';
import { dataSource, ApprovalRequest } from '@tradeflow/db';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';
import { ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

export type ReviewBody = {
  note?: string;
};

function serialize(a: ApprovalRequest) {
  return {
    id: a.id,
    entityType: a.entityType,
    entityId: a.entityId,
    status: a.status,
    requestedBy: a.requestedBy ?? null,
    reviewedBy: a.reviewedBy ?? null,
    reviewNote: a.reviewNote ?? null,
    branchId: a.branchId ?? null,
    createdAt: a.createdAt,
    reviewedAt: a.reviewedAt ?? null,
  };
}

export async function listApprovalRequests(req: Request): Promise<ControllerResult> {
  const branchId = resolveBranchId(req);
  const status = (req.query.status as string | undefined)?.trim() || 'pending';
  const { limit, offset } = getPagination(req);

  const qb = dataSource
    .getRepository(ApprovalRequest)
    .createQueryBuilder('a')
    .where('1=1')
    .orderBy('a.created_at', 'DESC')
    .take(limit)
    .skip(offset);

  if (branchId) {
    qb.andWhere('(a.branch_id IS NULL OR a.branch_id = :bid)', { bid: branchId });
  }
  if (status !== 'all') {
    qb.andWhere('a.status = :st', { st: status });
  }

  const [rows, total] = await qb.getManyAndCount();
  return ok({ data: rows.map(serialize), meta: { total, limit, offset } });
}

export async function approveApprovalRequest(req: Request, body: ReviewBody): Promise<ControllerResult> {
  const row = await dataSource.getRepository(ApprovalRequest).findOne({
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
  await dataSource.getRepository(ApprovalRequest).save(row);
  return ok({ data: serialize(row) });
}

export async function rejectApprovalRequest(req: Request, body: ReviewBody): Promise<ControllerResult> {
  const row = await dataSource.getRepository(ApprovalRequest).findOne({
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
  await dataSource.getRepository(ApprovalRequest).save(row);
  return ok({ data: serialize(row) });
}
