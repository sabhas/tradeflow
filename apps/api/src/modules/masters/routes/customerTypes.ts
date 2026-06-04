import { Router } from 'express';
import { paginationQuerySchema, createCustomerTypeSchema, updateCustomerTypeSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as customerTypesController from '../controllers/customerTypesController';

export const customerTypesRouter = Router();
customerTypesRouter.use(authMiddleware, loadUser);

customerTypesRouter.get(
  '/',
  requirePermission('masters.customers', 'read'),
  validateQuery(paginationQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await customerTypesController.listCustomerTypes(req));
  })
);

customerTypesRouter.post(
  '/',
  requirePermission('masters.customers', 'write'),
  auditMiddleware({ entity: 'CustomerType', getNewValue: (req) => req.body }),
  validateBody(createCustomerTypeSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await customerTypesController.createCustomerType(req, getValidatedBody(req)));
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
  validateBody(updateCustomerTypeSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await customerTypesController.updateCustomerType(req, getValidatedBody(req)));
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
