import type { Request } from 'express';
import type { z } from 'zod';
import { IsNull } from 'typeorm';
import { dataSource, UserNotification } from '@tradeflow/db';
import { paginationQuerySchema } from '@tradeflow/shared';
import { getValidatedQuery } from '../../../shared/middleware/validate';
import { getPaginationFromQuery } from '../../../shared/utils/pagination';
import { ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';
import { serializeNotification } from '../serializers/notification.serializer';

export async function listNotifications(req: Request): Promise<ControllerResult> {
  if (!req.auth?.userId) {
    throw new HttpError(401, { error: 'Unauthorized' });
  }
  const q = getValidatedQuery<z.infer<typeof paginationQuerySchema>>(req);
  const { limit, offset } = getPaginationFromQuery(q);
  const [rows, total] = await UserNotification.findAndCount({
    where: { userId: req.auth.userId },
    order: { createdAt: 'DESC' },
    take: limit,
    skip: offset,
  });
  const unread = await UserNotification.count({
    where: { userId: req.auth.userId, readAt: IsNull() },
  });
  return ok({
    data: rows.map(serializeNotification),
    meta: { total, limit, offset, unread },
  });
}

export async function markNotificationRead(req: Request): Promise<ControllerResult> {
  if (!req.auth?.userId) {
    throw new HttpError(401, { error: 'Unauthorized' });
  }
  const row = await UserNotification.findOne({
    where: { id: req.params.id, userId: req.auth.userId },
  });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  row.readAt = new Date();
  await UserNotification.save(row);
  return ok({ data: serializeNotification(row) });
}

export async function markAllNotificationsRead(req: Request): Promise<ControllerResult> {
  if (!req.auth?.userId) {
    throw new HttpError(401, { error: 'Unauthorized' });
  }
  await dataSource.query(
    `UPDATE user_notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
    [req.auth.userId]
  );
  return ok({ data: { ok: true } });
}
