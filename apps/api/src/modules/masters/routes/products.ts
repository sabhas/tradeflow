import { Router } from 'express';
import {
  createProductSchema,
  listProductsQuerySchema,
  replaceProductPricesSchema,
  updateProductSchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { validateBody, validateQuery } from '../../../shared/middleware/validate';
import { handle, handleBody } from '../../../shared/utils/handleRoute';
import * as productsController from '../controllers/productsController';

export const productsRouter = Router();

productsRouter.use(authMiddleware, loadUser);

productsRouter.get(
  '/',
  requirePermission('masters.products', 'read'),
  validateQuery(listProductsQuerySchema),
  handle(productsController.listProducts)
);

productsRouter.get(
  '/lookup/barcode/:barcode',
  requirePermission('masters.products', 'read'),
  handle(productsController.lookupProductByBarcode)
);

productsRouter.get(
  '/:id/prices',
  requirePermission('masters.products', 'read'),
  handle(productsController.getProductPrices)
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
  handleBody(productsController.replaceProductPrices)
);

productsRouter.get(
  '/:id',
  requirePermission('masters.products', 'read'),
  handle(productsController.getProduct)
);

productsRouter.post(
  '/',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'Product',
    getNewValue: (req) => req.body,
  }),
  validateBody(createProductSchema),
  handleBody(productsController.createProduct)
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
  handleBody(productsController.updateProduct)
);

productsRouter.delete(
  '/:id',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'Product',
    getEntityId: (req) => req.params.id,
    getOldValue: (req) => productsController.getOldProductSnapshotForAudit(req),
  }),
  handle(productsController.deleteProduct)
);
