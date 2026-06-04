import type { Request } from 'express';
import type { z } from 'zod';
import { listAuditLogsQuerySchema } from '@tradeflow/shared';
import { AuditLog } from '@tradeflow/db';
import { getValidatedQuery } from '../../../shared/middleware/validate';
import { getPaginationFromQuery } from '../../../shared/utils/pagination';
import { ok, type ControllerResult } from '../../../shared/utils/controllerResult';

export async function listAuditLogs(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof listAuditLogsQuerySchema>>(req);

  const fromDate = q.from?.trim() || q.dateFrom?.trim() || undefined;
  const toDate = q.to?.trim() || q.dateTo?.trim() || undefined;

  const { limit, offset } = getPaginationFromQuery(q);
  const repo = AuditLog.getRepository();

  const qb = repo.createQueryBuilder('a');
  if (q.entity?.trim()) {
    qb.andWhere('a.entity = :entity', { entity: q.entity.trim() });
  }
  if (q.entityId?.trim()) {
    qb.andWhere('a.entityId = :entityId', { entityId: q.entityId.trim() });
  }
  if (q.userId?.trim()) {
    qb.andWhere('a.userId = :userId', { userId: q.userId.trim() });
  }
  if (fromDate) {
    qb.andWhere('a.createdAt >= :fromDate', { fromDate });
  }
  if (toDate) {
    qb.andWhere('a.createdAt <= :toDate', { toDate });
  }

  const total = await qb.getCount();
  const logs = await qb.clone().orderBy('a.createdAt', 'DESC').skip(offset).take(limit).getMany();

  return ok({ data: logs, meta: { total, limit, offset } });
}
