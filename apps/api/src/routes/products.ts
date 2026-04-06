import { Router } from 'express';
import { createProductSchema, replaceProductPricesSchema, updateProductSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../controllers/asyncHandler';
import { sendControllerResult } from '../controllers/controllerResult';
import * as productsController from '../controllers/productsController';

export const productsRouter = Router();

productsRouter.use(authMiddleware, loadUser);

productsRouter.get(
  '/',
  requirePermission('masters.products', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await productsController.listProducts(req));
  })
);

productsRouter.get(
  '/lookup/barcode/:barcode',
  requirePermission('masters.products', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await productsController.lookupProductByBarcode(req));
  })
);

productsRouter.get(
  '/:id/prices',
  requirePermission('masters.products', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await productsController.getProductPrices(req));
  })
);

productsRouter.put(
  '/:id/prices',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'ProductPrice',
    getEntityId: (req) => req.params.id,
    getOldValue: (req) => productsController.loadProductPricesForAudit(req.params.id),
    getNewValue: (req) => req.body,
  }),
  asyncHandler(async (req, res) => {
    const parsed = replaceProductPricesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await productsController.replaceProductPrices(req, parsed.data));
  })
);

productsRouter.get(
  '/:id',
  requirePermission('masters.products', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await productsController.getProduct(req));
  })
);

productsRouter.post(
  '/',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'Product',
    getNewValue: (req) => req.body,
  }),
  asyncHandler(async (req, res) => {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await productsController.createProduct(req, parsed.data));
  })
);

productsRouter.patch(
  '/:id',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'Product',
    getEntityId: (req) => req.params.id,
    getOldValue: (req) => productsController.getOldProductSnapshotForAudit(req),
    getNewValue: (req) => req.body,
  }),
  asyncHandler(async (req, res) => {
    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await productsController.updateProduct(req, parsed.data));
  })
);

productsRouter.delete(
  '/:id',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'Product',
    getEntityId: (req) => req.params.id,
    getOldValue: (req) => productsController.getOldProductSnapshotForAudit(req),
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await productsController.deleteProduct(req));
  })
);
