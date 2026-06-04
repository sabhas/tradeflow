import { Router } from 'express';
import { createStockTransferSchema, listStockTransfersQuerySchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { handle, handleBody } from '../../../shared/utils/handleRoute';
import * as stockTransfersController from '../controllers/stockTransfersController';

export const stockTransfersRouter = Router();
stockTransfersRouter.use(authMiddleware, loadUser);

stockTransfersRouter.get(
  '/',
  requirePermission('inventory', 'read'),
  validateQuery(listStockTransfersQuerySchema),
  handle(stockTransfersController.listStockTransfers)
);

stockTransfersRouter.get(
  '/:id',
  requirePermission('inventory', 'read'),
  handle(stockTransfersController.getStockTransfer)
);

stockTransfersRouter.post(
  '/',
  requirePermission('inventory', 'write'),
  auditMiddleware({ entity: 'StockTransfer', getNewValue: (req) => req.body }),
  validateBody(createStockTransferSchema),
  handleBody(stockTransfersController.createStockTransfer)
);

stockTransfersRouter.post(
  '/:id/post',
  requirePermission('inventory', 'write'),
  auditMiddleware({
    entity: 'StockTransfer',
    getEntityId: (req) => req.params.id,
    getNewValue: () => ({ status: 'posted' }),
  }),
  handle(stockTransfersController.postStockTransfer)
);
