import { Router } from 'express';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
import * as recycleBinController from '../controllers/recycleBinController';

export const recycleBinRouter = Router();
recycleBinRouter.use(authMiddleware, loadUser);

recycleBinRouter.get(
  '/',
  requirePermission('recycle_bin', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await recycleBinController.listRecycleBin(req));
  })
);

recycleBinRouter.post(
  '/:entity/:id/restore',
  requirePermission('recycle_bin', 'restore'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await recycleBinController.restoreRecycleBinEntity(req));
  })
);
