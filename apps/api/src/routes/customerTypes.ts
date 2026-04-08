import { Router } from 'express';
import { createCustomerTypeSchema, updateCustomerTypeSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
import * as customerTypesController from '../controllers/customerTypesController';

export const customerTypesRouter = Router();
customerTypesRouter.use(authMiddleware, loadUser);

customerTypesRouter.get(
  '/',
  requirePermission('masters.customers', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await customerTypesController.listCustomerTypes(req));
  })
);

customerTypesRouter.post(
  '/',
  requirePermission('masters.customers', 'write'),
  auditMiddleware({ entity: 'CustomerType', getNewValue: (req) => req.body }),
  asyncHandler(async (req, res) => {
    const parsed = createCustomerTypeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await customerTypesController.createCustomerType(req, parsed.data));
  })
);

customerTypesRouter.patch(
  '/:id',
  requirePermission('masters.customers', 'write'),
  auditMiddleware({
    entity: 'CustomerType',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => customerTypesController.getCustomerTypeSnapshotForAudit(req.params.id),
    getNewValue: (req) => req.body,
  }),
  asyncHandler(async (req, res) => {
    const parsed = updateCustomerTypeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await customerTypesController.updateCustomerType(req, parsed.data));
  })
);

customerTypesRouter.delete(
  '/:id',
  requirePermission('masters.customers', 'write'),
  auditMiddleware({
    entity: 'CustomerType',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => customerTypesController.getCustomerTypeSnapshotForAudit(req.params.id),
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await customerTypesController.deleteCustomerType(req));
  })
);
