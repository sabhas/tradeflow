import { createCustomerTypeSchema, paginationQuerySchema, updateCustomerTypeSchema } from '@tradeflow/shared';
import { createCrudRouter } from '../../../shared/routing/createCrudRouter';
import * as customerTypesController from '../controllers/customerTypesController';

export const customerTypesRouter = createCrudRouter({
  permission: { module: 'masters.customers', read: 'read', write: 'write' },
  auditEntity: 'CustomerType',
  createSchema: createCustomerTypeSchema,
  updateSchema: updateCustomerTypeSchema,
  listQuerySchema: paginationQuerySchema,
  controller: {
    list: customerTypesController.listCustomerTypes,
    create: customerTypesController.createCustomerType,
    update: customerTypesController.updateCustomerType,
    delete: customerTypesController.deleteCustomerType,
    getSnapshotForAudit: customerTypesController.getCustomerTypeSnapshotForAudit,
  },
});
