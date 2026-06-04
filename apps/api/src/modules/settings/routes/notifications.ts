import { Router } from 'express';
import { paginationQuerySchema } from '@tradeflow/shared';
import { authMiddleware, loadUser } from '../../../shared/middleware/auth';
import { validateQuery } from '../../../shared/middleware/validate';
import { handle } from '../../../shared/utils/handleRoute';
import * as notificationsController from '../controllers/notificationsController';

export const notificationsRouter = Router();
notificationsRouter.use(authMiddleware, loadUser);

notificationsRouter.get(
  '/',
  validateQuery(paginationQuerySchema),
  handle(notificationsController.listNotifications)
);

notificationsRouter.patch('/:id/read', handle(notificationsController.markNotificationRead));

notificationsRouter.post('/read-all', handle(notificationsController.markAllNotificationsRead));
