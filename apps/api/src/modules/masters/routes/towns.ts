import { createTownSchema, listTownsQuerySchema, updateTownSchema } from '@tradeflow/shared';
import { createCrudRouter } from '../../../shared/routing/createCrudRouter';
import * as townsController from '../controllers/townsController';

export const townsRouter = createCrudRouter({
  permission: { module: 'masters.customers', read: 'read', write: 'write' },
  auditEntity: 'Town',
  createSchema: createTownSchema,
  updateSchema: updateTownSchema,
  listQuerySchema: listTownsQuerySchema,
  controller: {
    list: townsController.listTowns,
    create: townsController.createTown,
    update: townsController.updateTown,
    delete: townsController.deleteTown,
    getSnapshotForAudit: townsController.getTownSnapshotForAudit,
  },
});
