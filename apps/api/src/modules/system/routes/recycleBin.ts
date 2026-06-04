import { Router } from 'express';
import { listRecycleBinQuerySchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { validateQuery } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as recycleBinController from '../controllers/recycleBinController';

export const recycleBinRouter = Router();
recycleBinRouter.use(authMiddleware, loadUser);

recycleBinRouter.get(
  '/',
  requirePermission('recycle_bin', 'read'),
  validateQuery(listRecycleBinQuerySchema),
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
