import { Router } from 'express';
import { listRecycleBinQuerySchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { validateQuery } from '../../../shared/middleware/validate';
import { handle } from '../../../shared/utils/handleRoute';
import * as recycleBinController from '../controllers/recycleBinController';

export const recycleBinRouter = Router();
recycleBinRouter.use(authMiddleware, loadUser);

recycleBinRouter.get(
  '/',
  requirePermission('recycle_bin', 'read'),
  validateQuery(listRecycleBinQuerySchema),
  handle(recycleBinController.listRecycleBin)
);

recycleBinRouter.post(
  '/:entity/:id/restore',
  requirePermission('recycle_bin', 'restore'),
  handle(recycleBinController.restoreRecycleBinEntity)
);
