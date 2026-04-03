import { Router } from 'express';
import { dataSource } from '@tradeflow/db';
import { AuditLog } from '@tradeflow/db';
import { authMiddleware, requirePermission } from '../middleware/auth';
import { getPagination } from '../utils/pagination';

export const auditRouter = Router();

auditRouter.get('/', authMiddleware, requirePermission('audit', 'read'), async (req, res) => {
  const { entity, entityId, userId, from, to, dateFrom, dateTo } = req.query;

  const fromDate =
    (typeof from === 'string' && from.trim()) ||
    (typeof dateFrom === 'string' && dateFrom.trim()) ||
    undefined;
  const toDate =
    (typeof to === 'string' && to.trim()) ||
    (typeof dateTo === 'string' && dateTo.trim()) ||
    undefined;

  const { limit, offset } = getPagination(req);
  const repo = dataSource.getRepository(AuditLog);

  const qb = repo.createQueryBuilder('a');
  if (typeof entity === 'string' && entity.trim()) {
    qb.andWhere('a.entity = :entity', { entity: entity.trim() });
  }
  if (typeof entityId === 'string' && entityId.trim()) {
    qb.andWhere('a.entityId = :entityId', { entityId: entityId.trim() });
  }
  if (typeof userId === 'string' && userId.trim()) {
    qb.andWhere('a.userId = :userId', { userId: userId.trim() });
  }
  if (fromDate) {
    qb.andWhere('a.createdAt >= :fromDate', { fromDate });
  }
  if (toDate) {
    qb.andWhere('a.createdAt <= :toDate', { toDate });
  }

  const total = await qb.getCount();
  const logs = await qb
    .clone()
    .orderBy('a.createdAt', 'DESC')
    .skip(offset)
    .take(limit)
    .getMany();

  res.json({ data: logs, meta: { total, limit, offset } });
});
