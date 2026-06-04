import { createUnitSchema, paginationQuerySchema, updateUnitSchema } from '@tradeflow/shared';
import { createCrudRouter } from '../../../shared/routing/createCrudRouter';
import * as unitsController from '../controllers/unitsController';

export const unitsRouter = createCrudRouter({
  permission: { module: 'masters.products', read: 'read', write: 'write' },
  auditEntity: 'UnitOfMeasure',
  createSchema: createUnitSchema,
  updateSchema: updateUnitSchema,
  listQuerySchema: paginationQuerySchema,
  controller: {
    list: unitsController.listUnits,
    create: unitsController.createUnit,
    update: unitsController.updateUnit,
    delete: unitsController.deleteUnit,
    getSnapshotForAudit: unitsController.getUnitSnapshotForAudit,
  },
});
