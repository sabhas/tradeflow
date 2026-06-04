import { createTaxProfileSchema, paginationQuerySchema, updateTaxProfileSchema } from '@tradeflow/shared';
import { createCrudRouter } from '../../../shared/routing/createCrudRouter';
import * as taxProfilesController from '../controllers/taxProfilesController';

export const taxProfilesRouter = createCrudRouter({
  permission: { module: 'masters.tax', read: 'read', write: 'write' },
  auditEntity: 'TaxProfile',
  createSchema: createTaxProfileSchema,
  updateSchema: updateTaxProfileSchema,
  listQuerySchema: paginationQuerySchema,
  controller: {
    list: taxProfilesController.listTaxProfiles,
    create: taxProfilesController.createTaxProfile,
    update: taxProfilesController.updateTaxProfile,
    delete: taxProfilesController.deleteTaxProfile,
    getSnapshotForAudit: taxProfilesController.getTaxProfileSnapshotForAudit,
  },
});
