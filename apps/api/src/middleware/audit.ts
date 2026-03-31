import { Request, Response, NextFunction } from 'express';
import { dataSource } from '@tradeflow/db';
import { AuditLog } from '@tradeflow/db';

export type AuditAction = 'create' | 'update' | 'delete';

export interface AuditConfig {
  entity: string;
  getEntityId?: (req: Request, res: Response) => string | undefined;
  getOldValue?: (req: Request) => unknown;
  getNewValue?: (req: Request) => unknown;
}

const auditQueue: Array<{
  userId: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
}> = [];

export function auditMiddleware(config: AuditConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const oldValueSnapshot = config.getOldValue?.(req);
    const originalJson = res.json.bind(res);
    let action: AuditAction = 'create';

    res.json = function (body: unknown) {
      if (res.statusCode >= 200 && res.statusCode < 300 && req.auth?.userId) {
        if (req.method === 'PUT' || req.method === 'PATCH') action = 'update';
        else if (req.method === 'DELETE') action = 'delete';

        const entityId = config.getEntityId?.(req, res);
        const newValue =
          config.getNewValue?.(req) ??
          (typeof body === 'object' && body && 'data' in body
            ? (body as { data: unknown }).data
            : body);

        auditQueue.push({
          userId: req.auth.userId,
          action,
          entity: config.entity,
          entityId,
          oldValue: oldValueSnapshot,
          newValue,
        });
        flushAuditQueue().catch(console.error);
      }
      return originalJson(body);
    };
    next();
  };
}

async function flushAuditQueue() {
  if (auditQueue.length === 0) return;
  const toFlush = auditQueue.splice(0, auditQueue.length);
  try {
    const repo = dataSource.getRepository(AuditLog);
    for (const entry of toFlush) {
      await repo.save({
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        oldValue: entry.oldValue as Record<string, unknown> | undefined,
        newValue: entry.newValue as Record<string, unknown> | undefined,
      });
    }
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}
