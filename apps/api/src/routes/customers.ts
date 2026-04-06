import { Router } from 'express';
import { createCustomerSchema, updateCustomerSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../controllers/asyncHandler';
import { sendControllerResult } from '../controllers/controllerResult';
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
  asyncHandler(async (req, res) => {
    const parsed = createCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await customersController.createCustomer(req, parsed.data));
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
  asyncHandler(async (req, res) => {
    const parsed = updateCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await customersController.updateCustomer(req, parsed.data));
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
