import { Router } from 'express';
import { createProductCategorySchema, updateProductCategorySchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { getValidatedBody, validateBody } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
import * as productCategoriesController from '../controllers/productCategoriesController';

export const productCategoriesRouter = Router();

productCategoriesRouter.use(authMiddleware, loadUser);

productCategoriesRouter.get(
  '/',
  requirePermission('masters.products', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await productCategoriesController.listProductCategories(req));
  })
);

productCategoriesRouter.post(
  '/',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'ProductCategory',
    getNewValue: (req) => req.body,
  }),
  validateBody(createProductCategorySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(
      res,
      await productCategoriesController.createProductCategory(req, getValidatedBody(req))
    );
  })
);

productCategoriesRouter.patch(
  '/:id',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'ProductCategory',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => productCategoriesController.getProductCategorySnapshotForAudit(req.params.id),
    getNewValue: (req) => req.body,
  }),
  validateBody(updateProductCategorySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(
      res,
      await productCategoriesController.updateProductCategory(req, getValidatedBody(req))
    );
  })
);

productCategoriesRouter.delete(
  '/:id',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'ProductCategory',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => productCategoriesController.getProductCategorySnapshotForAudit(req.params.id),
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await productCategoriesController.deleteProductCategory(req));
  })
);
