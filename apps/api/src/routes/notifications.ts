import { Router } from 'express';
import { IsNull } from 'typeorm';
import { dataSource, UserNotification } from '@tradeflow/db';
import { authMiddleware, loadUser } from '../middleware/auth';
import { getPagination } from '../utils/pagination';

export const notificationsRouter = Router();
notificationsRouter.use(authMiddleware, loadUser);

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

notificationsRouter.get('/', async (req, res) => {
  if (!req.auth?.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { limit, offset } = getPagination(req);
  const [rows, total] = await dataSource.getRepository(UserNotification).findAndCount({
    where: { userId: req.auth.userId },
    order: { createdAt: 'DESC' },
    take: limit,
    skip: offset,
  });
  const unread = await dataSource.getRepository(UserNotification).count({
    where: { userId: req.auth.userId, readAt: IsNull() },
  });
  res.json({
    data: rows.map(serialize),
    meta: { total, limit, offset, unread },
  });
});

notificationsRouter.patch('/:id/read', async (req, res) => {
  if (!req.auth?.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const row = await dataSource.getRepository(UserNotification).findOne({
    where: { id: req.params.id, userId: req.auth.userId },
  });
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  row.readAt = new Date();
  await dataSource.getRepository(UserNotification).save(row);
  res.json({ data: serialize(row) });
});

notificationsRouter.post('/read-all', async (req, res) => {
  if (!req.auth?.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  await dataSource.query(
    `UPDATE user_notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
    [req.auth.userId]
  );
  res.json({ data: { ok: true } });
});
