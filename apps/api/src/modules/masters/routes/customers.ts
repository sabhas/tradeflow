import { Router } from 'express';
import {
  createCustomerSchema,
  customerStatementQuerySchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { validateBody, validateQuery } from '../../../shared/middleware/validate';
import { handle, handleBody } from '../../../shared/utils/handleRoute';
import * as customersController from '../controllers/customersController';

export const customersRouter = Router();
customersRouter.use(authMiddleware, loadUser);

customersRouter.get(
  '/',
  requirePermission('masters.customers', 'read'),
  validateQuery(listCustomersQuerySchema),
  handle(customersController.listCustomers)
);

customersRouter.get(
  '/:id/statement',
  requirePermission('sales', 'read'),
  validateQuery(customerStatementQuerySchema),
  handle(customersController.getCustomerStatement)
);

customersRouter.get(
  '/:id',
  requirePermission('masters.customers', 'read'),
  handle(customersController.getCustomer)
);

customersRouter.post(
  '/',
  requirePermission('masters.customers', 'write'),
  auditMiddleware({ entity: 'Customer', getNewValue: (req) => req.body }),
  validateBody(createCustomerSchema),
  handleBody(customersController.createCustomer)
);

customersRouter.patch(
  '/:id',
  requirePermission('masters.customers', 'write'),
  auditMiddleware({
    entity: 'Customer',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => customersController.getCustomerSnapshotForAudit(req.params.id),
    getNewValue: (req) => req.body,
  }),
  validateBody(updateCustomerSchema),
  handleBody(customersController.updateCustomer)
);

customersRouter.delete(
  '/:id',
  requirePermission('masters.customers', 'write'),
  auditMiddleware({
    entity: 'Customer',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => customersController.getCustomerSnapshotForAudit(req.params.id),
  }),
  handle(customersController.deleteCustomer)
);
