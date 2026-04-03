import { Router } from 'express';
import { dataSource, ApprovalRequest } from '@tradeflow/db';
import { z } from 'zod';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';

export const approvalsRouter = Router();
approvalsRouter.use(authMiddleware, loadUser);

const reviewBodySchema = z.object({
  note: z.string().max(2000).optional(),
});

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

approvalsRouter.get('/', requirePermission('accounting', 'read'), async (req, res) => {
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
  res.json({ data: rows.map(serialize), meta: { total, limit, offset } });
});

approvalsRouter.post('/:id/approve', requirePermission('accounting', 'write'), async (req, res) => {
  const parsed = reviewBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }
  const row = await dataSource.getRepository(ApprovalRequest).findOne({
    where: { id: req.params.id },
  });
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (row.status !== 'pending') {
    res.status(400).json({ error: 'Request is not pending' });
    return;
  }
  row.status = 'approved';
  row.reviewedBy = req.auth?.userId;
  row.reviewNote = parsed.data.note ?? undefined;
  row.reviewedAt = new Date();
  await dataSource.getRepository(ApprovalRequest).save(row);
  res.json({ data: serialize(row) });
});

approvalsRouter.post('/:id/reject', requirePermission('accounting', 'write'), async (req, res) => {
  const parsed = reviewBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }
  const row = await dataSource.getRepository(ApprovalRequest).findOne({
    where: { id: req.params.id },
  });
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (row.status !== 'pending') {
    res.status(400).json({ error: 'Request is not pending' });
    return;
  }
  row.status = 'rejected';
  row.reviewedBy = req.auth?.userId;
  row.reviewNote = parsed.data.note ?? undefined;
  row.reviewedAt = new Date();
  await dataSource.getRepository(ApprovalRequest).save(row);
  res.json({ data: serialize(row) });
});
