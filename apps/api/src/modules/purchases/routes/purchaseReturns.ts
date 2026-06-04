import { Router } from 'express';
import {
  createPurchaseReturnSchema,
  listPurchaseReturnsQuerySchema,
  updatePurchaseReturnSchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { handle, handleBody } from '../../../shared/utils/handleRoute';
import * as purchaseReturnsController from '../controllers/purchaseReturnsController';

export const purchaseReturnsRouter = Router();
purchaseReturnsRouter.use(authMiddleware, loadUser);

purchaseReturnsRouter.get(
  '/',
  requirePermission('purchases.grn', 'read'),
  validateQuery(listPurchaseReturnsQuerySchema),
  handle(purchaseReturnsController.listPurchaseReturns)
);

purchaseReturnsRouter.get(
  '/:id',
  requirePermission('purchases.grn', 'read'),
  handle(purchaseReturnsController.getPurchaseReturn)
);

purchaseReturnsRouter.post(
  '/',
  requirePermission('purchases.grn', 'write'),
  auditMiddleware({ entity: 'PurchaseReturn', getNewValue: (req) => req.body }),
  validateBody(createPurchaseReturnSchema),
  handleBody(purchaseReturnsController.createPurchaseReturn)
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
  handleBody(purchaseReturnsController.updatePurchaseReturn)
);

purchaseReturnsRouter.post(
  '/:id/post',
  requirePermission('purchases.grn', 'post'),
  auditMiddleware({
    entity: 'PurchaseReturn',
    getEntityId: (req) => req.params.id,
    getNewValue: () => ({ status: 'posted' }),
  }),
  handle(purchaseReturnsController.postPurchaseReturn)
);

purchaseReturnsRouter.delete(
  '/:id',
  requirePermission('purchases.grn', 'write'),
  auditMiddleware({
    entity: 'PurchaseReturn',
    getEntityId: (req) => req.params.id,
  }),
  handle(purchaseReturnsController.deletePurchaseReturn)
);
