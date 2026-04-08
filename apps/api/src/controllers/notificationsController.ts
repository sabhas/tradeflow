import type { Request } from 'express';
import { IsNull } from 'typeorm';
import { dataSource, UserNotification } from '@tradeflow/db';
import { getPagination } from '../utils/pagination';
import { ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

function serialize(n: UserNotification) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body ?? null,
    readAt: n.readAt ?? null,
    createdAt: n.createdAt,
  };
}

export async function listNotifications(req: Request): Promise<ControllerResult> {
  if (!req.auth?.userId) {
    throw new HttpError(401, { error: 'Unauthorized' });
  }
  const { limit, offset } = getPagination(req);
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
    data: rows.map(serialize),
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
  return ok({ data: serialize(row) });
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
