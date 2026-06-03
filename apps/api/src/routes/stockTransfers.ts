import { Router } from 'express';
import { createStockTransferSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { getValidatedBody, validateBody } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
import * as stockTransfersController from '../controllers/stockTransfersController';

export const stockTransfersRouter = Router();
stockTransfersRouter.use(authMiddleware, loadUser);

stockTransfersRouter.get(
  '/',
  requirePermission('inventory', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await stockTransfersController.listStockTransfers(req));
  })
);

stockTransfersRouter.get(
  '/:id',
  requirePermission('inventory', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await stockTransfersController.getStockTransfer(req));
  })
);

stockTransfersRouter.post(
  '/',
  requirePermission('inventory', 'write'),
  auditMiddleware({ entity: 'StockTransfer', getNewValue: (req) => req.body }),
  validateBody(createStockTransferSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await stockTransfersController.createStockTransfer(req, getValidatedBody(req)));
  })
);

stockTransfersRouter.post(
  '/:id/post',
  requirePermission('inventory', 'write'),
  auditMiddleware({
    entity: 'StockTransfer',
    getEntityId: (req) => req.params.id,
    getNewValue: () => ({ status: 'posted' }),
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await stockTransfersController.postStockTransfer(req));
  })
);
