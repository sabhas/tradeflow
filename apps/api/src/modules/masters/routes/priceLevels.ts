import { createPriceLevelSchema, paginationQuerySchema, updatePriceLevelSchema } from '@tradeflow/shared';
import { createCrudRouter } from '../../../shared/routing/createCrudRouter';
import * as priceLevelsController from '../controllers/priceLevelsController';

export const priceLevelsRouter = createCrudRouter({
  permission: { module: 'masters.products', read: 'read', write: 'write' },
  auditEntity: 'PriceLevel',
  createSchema: createPriceLevelSchema,
  updateSchema: updatePriceLevelSchema,
  listQuerySchema: paginationQuerySchema,
  controller: {
    list: priceLevelsController.listPriceLevels,
    create: priceLevelsController.createPriceLevel,
    update: priceLevelsController.updatePriceLevel,
    getSnapshotForAudit: priceLevelsController.getPriceLevelSnapshotForAudit,
  },
  includeDelete: false,
});
