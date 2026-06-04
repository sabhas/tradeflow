import {
  createProductCategorySchema,
  listProductCategoriesQuerySchema,
  updateProductCategorySchema,
} from '@tradeflow/shared';
import { createCrudRouter } from '../../../shared/routing/createCrudRouter';
import * as productCategoriesController from '../controllers/productCategoriesController';

export const productCategoriesRouter = createCrudRouter({
  permission: { module: 'masters.products', read: 'read', write: 'write' },
  auditEntity: 'ProductCategory',
  createSchema: createProductCategorySchema,
  updateSchema: updateProductCategorySchema,
  listQuerySchema: listProductCategoriesQuerySchema,
  controller: {
    list: productCategoriesController.listProductCategories,
    create: productCategoriesController.createProductCategory,
    update: productCategoriesController.updateProductCategory,
    delete: productCategoriesController.deleteProductCategory,
    getSnapshotForAudit: productCategoriesController.getProductCategorySnapshotForAudit,
  },
});
