import { createPaymentTermsSchema, paginationQuerySchema, updatePaymentTermsSchema } from '@tradeflow/shared';
import { createCrudRouter } from '../../../shared/routing/createCrudRouter';
import * as paymentTermsController from '../controllers/paymentTermsController';

export const paymentTermsRouter = createCrudRouter({
  permission: { module: 'masters.payment_terms', read: 'read', write: 'write' },
  auditEntity: 'PaymentTerms',
  createSchema: createPaymentTermsSchema,
  updateSchema: updatePaymentTermsSchema,
  listQuerySchema: paginationQuerySchema,
  controller: {
    list: paymentTermsController.listPaymentTerms,
    create: paymentTermsController.createPaymentTerms,
    update: paymentTermsController.updatePaymentTerms,
    delete: paymentTermsController.deletePaymentTerms,
    getSnapshotForAudit: paymentTermsController.getPaymentTermsSnapshotForAudit,
  },
});
