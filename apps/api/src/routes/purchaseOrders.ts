import { Router } from 'express';
import { createPurchaseOrderSchema, updatePurchaseOrderSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../controllers/asyncHandler';
import { sendControllerResult } from '../controllers/controllerResult';
import * as purchaseOrdersController from '../controllers/purchaseOrdersController';

export const purchaseOrdersRouter = Router();
purchaseOrdersRouter.use(authMiddleware, loadUser);

purchaseOrdersRouter.get(
  '/',
  requirePermission('purchases.orders', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await purchaseOrdersController.listPurchaseOrders(req));
  })
);

purchaseOrdersRouter.get(
  '/:id/grn-eligible',
  requirePermission('purchases.orders', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await purchaseOrdersController.getPurchaseOrderGrnEligible(req));
  })
);

purchaseOrdersRouter.get(
  '/:id',
  requirePermission('purchases.orders', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await purchaseOrdersController.getPurchaseOrder(req));
  })
);

purchaseOrdersRouter.post(
  '/',
  requirePermission('purchases.orders', 'write'),
  auditMiddleware({ entity: 'PurchaseOrder', getNewValue: (req) => req.body }),
  asyncHandler(async (req, res) => {
    const parsed = createPurchaseOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await purchaseOrdersController.createPurchaseOrder(req, parsed.data));
  })
);

purchaseOrdersRouter.patch(
  '/:id',
  requirePermission('purchases.orders', 'write'),
  auditMiddleware({
    entity: 'PurchaseOrder',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => purchaseOrdersController.getPurchaseOrderSnapshotForAudit(req.params.id),
    getNewValue: (req) => req.body,
  }),
  asyncHandler(async (req, res) => {
    const parsed = updatePurchaseOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await purchaseOrdersController.updatePurchaseOrder(req, parsed.data));
  })
);

purchaseOrdersRouter.post(
  '/:id/send',
  requirePermission('purchases.orders', 'post'),
  auditMiddleware({
    entity: 'PurchaseOrder',
    getEntityId: (req) => req.params.id,
    getNewValue: () => ({ status: 'sent' }),
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await purchaseOrdersController.sendPurchaseOrder(req));
  })
);

purchaseOrdersRouter.delete(
  '/:id',
  requirePermission('purchases.orders', 'write'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await purchaseOrdersController.deletePurchaseOrder(req));
  })
);
