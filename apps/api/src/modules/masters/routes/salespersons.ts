import { createSalespersonSchema, paginationQuerySchema, updateSalespersonSchema } from '@tradeflow/shared';
import { createCrudRouter } from '../../../shared/routing/createCrudRouter';
import * as salespersonsController from '../controllers/salespersonsController';

export const salespersonsRouter = createCrudRouter({
  permission: { module: 'masters.salespersons', read: 'read', write: 'write' },
  auditEntity: 'Salesperson',
  createSchema: createSalespersonSchema,
  updateSchema: updateSalespersonSchema,
  listQuerySchema: paginationQuerySchema,
  controller: {
    list: salespersonsController.listSalespersons,
    create: salespersonsController.createSalesperson,
    update: salespersonsController.updateSalesperson,
    delete: salespersonsController.deleteSalesperson,
    getSnapshotForAudit: salespersonsController.getSalespersonSnapshotForAudit,
  },
});
