import { Router } from 'express';
import { createPurchaseReturnSchema, updatePurchaseReturnSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
import * as purchaseReturnsController from '../controllers/purchaseReturnsController';

export const purchaseReturnsRouter = Router();
purchaseReturnsRouter.use(authMiddleware, loadUser);

purchaseReturnsRouter.get(
  '/',
  requirePermission('purchases.grn', 'read'),
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
  asyncHandler(async (req, res) => {
    const parsed = createPurchaseReturnSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await purchaseReturnsController.createPurchaseReturn(req, parsed.data));
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
  asyncHandler(async (req, res) => {
    const parsed = updatePurchaseReturnSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await purchaseReturnsController.updatePurchaseReturn(req, parsed.data));
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
