import { Router } from 'express';
import { createReceiptSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as receiptsController from '../controllers/receiptsController';

export const receiptsRouter = Router();
receiptsRouter.use(authMiddleware, loadUser);

receiptsRouter.get(
  '/',
  requirePermission('sales', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await receiptsController.listReceipts(req));
  })
);

receiptsRouter.get(
  '/:id',
  requirePermission('sales', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await receiptsController.getReceipt(req));
  })
);

receiptsRouter.post(
  '/',
  requirePermission('sales', 'post'),
  auditMiddleware({ entity: 'Receipt', getNewValue: (req) => req.body }),
  validateBody(createReceiptSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await receiptsController.createReceipt(req, getValidatedBody(req)));
  })
);
