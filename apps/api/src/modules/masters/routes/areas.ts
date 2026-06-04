import { createAreaSchema, paginationQuerySchema, updateAreaSchema } from '@tradeflow/shared';
import { createCrudRouter } from '../../../shared/routing/createCrudRouter';
import * as areasController from '../controllers/areasController';

export const areasRouter = createCrudRouter({
  permission: { module: 'masters.customers', read: 'read', write: 'write' },
  auditEntity: 'Area',
  createSchema: createAreaSchema,
  updateSchema: updateAreaSchema,
  listQuerySchema: paginationQuerySchema,
  controller: {
    list: areasController.listAreas,
    create: areasController.createArea,
    update: areasController.updateArea,
    delete: areasController.deleteArea,
    getSnapshotForAudit: areasController.getAreaSnapshotForAudit,
  },
});
