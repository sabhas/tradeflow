import { Router } from 'express';
import { dataSource } from '@tradeflow/db';
import { AuditLog } from '@tradeflow/db';
import { authMiddleware, requirePermission } from '../middleware/auth';

export const auditRouter = Router();

auditRouter.get(
  '/',
  authMiddleware,
  requirePermission('audit', 'read'),
  async (req, res) => {
    const { entity, userId, from, to } = req.query;
    const repo = dataSource.getRepository(AuditLog);
    const qb = repo.createQueryBuilder('a').orderBy('a.createdAt', 'DESC').take(100);

    if (typeof entity === 'string') qb.andWhere('a.entity = :entity', { entity });
    if (typeof userId === 'string') qb.andWhere('a.user_id = :userId', { userId });
    if (typeof from === 'string') qb.andWhere('a.created_at >= :from', { from });
    if (typeof to === 'string') qb.andWhere('a.created_at <= :to', { to });

    const logs = await qb.getMany();
    res.json(logs);
  }
);
