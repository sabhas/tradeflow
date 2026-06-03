import { Router } from 'express';
import { createCustomerSchema, updateCustomerSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { getValidatedBody, validateBody } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
import * as customersController from '../controllers/customersController';

export const customersRouter = Router();
customersRouter.use(authMiddleware, loadUser);

customersRouter.get(
  '/',
  requirePermission('masters.customers', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await customersController.listCustomers(req));
  })
);

customersRouter.get(
  '/:id/statement',
  requirePermission('sales', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await customersController.getCustomerStatement(req));
  })
);

customersRouter.get(
  '/:id',
  requirePermission('masters.customers', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await customersController.getCustomer(req));
  })
);

customersRouter.post(
  '/',
  requirePermission('masters.customers', 'write'),
  auditMiddleware({ entity: 'Customer', getNewValue: (req) => req.body }),
  validateBody(createCustomerSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await customersController.createCustomer(req, getValidatedBody(req)));
  })
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
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await customersController.updateCustomer(req, getValidatedBody(req)));
  })
);

customersRouter.delete(
  '/:id',
  requirePermission('masters.customers', 'write'),
  auditMiddleware({
    entity: 'Customer',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => customersController.getCustomerSnapshotForAudit(req.params.id),
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await customersController.deleteCustomer(req));
  })
);
