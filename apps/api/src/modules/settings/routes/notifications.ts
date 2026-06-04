import { Router } from 'express';
import { paginationQuerySchema } from '@tradeflow/shared';
import { authMiddleware, loadUser } from '../../../shared/middleware/auth';
import { validateQuery } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as notificationsController from '../controllers/notificationsController';

export const notificationsRouter = Router();
notificationsRouter.use(authMiddleware, loadUser);

notificationsRouter.get(
  '/',
  validateQuery(paginationQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await notificationsController.listNotifications(req));
  })
);

notificationsRouter.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await notificationsController.markNotificationRead(req));
  })
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await notificationsController.markAllNotificationsRead(req));
  })
);
