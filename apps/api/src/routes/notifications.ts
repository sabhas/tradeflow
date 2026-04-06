import { Router } from 'express';
import { authMiddleware, loadUser } from '../middleware/auth';
import { asyncHandler } from '../controllers/asyncHandler';
import { sendControllerResult } from '../controllers/controllerResult';
import * as notificationsController from '../controllers/notificationsController';

export const notificationsRouter = Router();
notificationsRouter.use(authMiddleware, loadUser);

notificationsRouter.get(
  '/',
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
