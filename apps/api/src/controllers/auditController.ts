import type { Request } from 'express';
import { dataSource, AuditLog } from '@tradeflow/db';
import { getPagination } from '../utils/pagination';
import { ok, type ControllerResult } from '../utils/controllerResult';

export async function listAuditLogs(req: Request): Promise<ControllerResult> {
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

  return ok({ data: logs, meta: { total, limit, offset } });
}
