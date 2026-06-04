import { Router } from 'express';
import {
  createProductSchema,
  listProductsQuerySchema,
  replaceProductPricesSchema,
  updateProductSchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as productsController from '../controllers/productsController';

export const productsRouter = Router();

productsRouter.use(authMiddleware, loadUser);

productsRouter.get(
  '/',
  requirePermission('masters.products', 'read'),
  validateQuery(listProductsQuerySchema),
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
  validateBody(replaceProductPricesSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await productsController.replaceProductPrices(req, getValidatedBody(req)));
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
  validateBody(createProductSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await productsController.createProduct(req, getValidatedBody(req)));
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
  validateBody(updateProductSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await productsController.updateProduct(req, getValidatedBody(req)));
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
