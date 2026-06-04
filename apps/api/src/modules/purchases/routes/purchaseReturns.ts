import { Router } from 'express';
import {
  createPurchaseReturnSchema,
  listPurchaseReturnsQuerySchema,
  updatePurchaseReturnSchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as purchaseReturnsController from '../controllers/purchaseReturnsController';

export const purchaseReturnsRouter = Router();
purchaseReturnsRouter.use(authMiddleware, loadUser);

purchaseReturnsRouter.get(
  '/',
  requirePermission('purchases.grn', 'read'),
  validateQuery(listPurchaseReturnsQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await purchaseReturnsController.listPurchaseReturns(req));
  })
);

purchaseReturnsRouter.get(
  '/:id',
  requirePermission('purchases.grn', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await purchaseReturnsController.getPurchaseReturn(req));
  })
);

purchaseReturnsRouter.post(
  '/',
  requirePermission('purchases.grn', 'write'),
  auditMiddleware({ entity: 'PurchaseReturn', getNewValue: (req) => req.body }),
  validateBody(createPurchaseReturnSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(
      res,
      await purchaseReturnsController.createPurchaseReturn(req, getValidatedBody(req))
    );
  })
);

purchaseReturnsRouter.patch(
  '/:id',
  requirePermission('purchases.grn', 'write'),
  auditMiddleware({
    entity: 'PurchaseReturn',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  validateBody(updatePurchaseReturnSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(
      res,
      await purchaseReturnsController.updatePurchaseReturn(req, getValidatedBody(req))
    );
  })
);

purchaseReturnsRouter.post(
  '/:id/post',
  requirePermission('purchases.grn', 'post'),
  auditMiddleware({
    entity: 'PurchaseReturn',
    getEntityId: (req) => req.params.id,
    getNewValue: () => ({ status: 'posted' }),
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await purchaseReturnsController.postPurchaseReturn(req));
  })
);

purchaseReturnsRouter.delete(
  '/:id',
  requirePermission('purchases.grn', 'write'),
  auditMiddleware({
    entity: 'PurchaseReturn',
    getEntityId: (req) => req.params.id,
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await purchaseReturnsController.deletePurchaseReturn(req));
  })
);
