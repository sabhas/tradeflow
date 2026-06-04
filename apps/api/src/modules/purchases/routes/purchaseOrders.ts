import { Router } from 'express';
import {
  createPurchaseOrderSchema,
  listPurchaseOrdersQuerySchema,
  updatePurchaseOrderSchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { handle, handleBody } from '../../../shared/utils/handleRoute';
import * as purchaseOrdersController from '../controllers/purchaseOrdersController';

export const purchaseOrdersRouter = Router();
purchaseOrdersRouter.use(authMiddleware, loadUser);

purchaseOrdersRouter.get(
  '/',
  requirePermission('purchases.orders', 'read'),
  validateQuery(listPurchaseOrdersQuerySchema),
  handle(purchaseOrdersController.listPurchaseOrders)
);

purchaseOrdersRouter.get(
  '/:id/grn-eligible',
  requirePermission('purchases.orders', 'read'),
  handle(purchaseOrdersController.getPurchaseOrderGrnEligible)
);

purchaseOrdersRouter.get(
  '/:id',
  requirePermission('purchases.orders', 'read'),
  handle(purchaseOrdersController.getPurchaseOrder)
);

purchaseOrdersRouter.post(
  '/',
  requirePermission('purchases.orders', 'write'),
  auditMiddleware({ entity: 'PurchaseOrder', getNewValue: (req) => req.body }),
  validateBody(createPurchaseOrderSchema),
  handleBody(purchaseOrdersController.createPurchaseOrder)
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
  validateBody(updatePurchaseOrderSchema),
  handleBody(purchaseOrdersController.updatePurchaseOrder)
);

purchaseOrdersRouter.post(
  '/:id/send',
  requirePermission('purchases.orders', 'post'),
  auditMiddleware({
    entity: 'PurchaseOrder',
    getEntityId: (req) => req.params.id,
    getNewValue: () => ({ status: 'sent' }),
  }),
  handle(purchaseOrdersController.sendPurchaseOrder)
);

purchaseOrdersRouter.delete(
  '/:id',
  requirePermission('purchases.orders', 'write'),
  handle(purchaseOrdersController.deletePurchaseOrder)
);
