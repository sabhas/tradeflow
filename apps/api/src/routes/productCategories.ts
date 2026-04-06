import { Router } from 'express';
import { createProductCategorySchema, updateProductCategorySchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
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
  asyncHandler(async (req, res) => {
    const parsed = createProductCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await productCategoriesController.createProductCategory(req, parsed.data));
  })
);

productCategoriesRouter.patch(
  '/:id',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'ProductCategory',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) =>
      productCategoriesController.getProductCategorySnapshotForAudit(req.params.id),
    getNewValue: (req) => req.body,
  }),
  asyncHandler(async (req, res) => {
    const parsed = updateProductCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await productCategoriesController.updateProductCategory(req, parsed.data));
  })
);

productCategoriesRouter.delete(
  '/:id',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'ProductCategory',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) =>
      productCategoriesController.getProductCategorySnapshotForAudit(req.params.id),
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await productCategoriesController.deleteProductCategory(req));
  })
);
