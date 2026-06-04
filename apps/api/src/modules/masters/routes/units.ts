import { Router } from 'express';
import { createUnitSchema, paginationQuerySchema, updateUnitSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as unitsController from '../controllers/unitsController';

export const unitsRouter = Router();
unitsRouter.use(authMiddleware, loadUser);

unitsRouter.get(
  '/',
  requirePermission('masters.products', 'read'),
  validateQuery(paginationQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await unitsController.listUnits(req));
  })
);

unitsRouter.post(
  '/',
  requirePermission('masters.products', 'write'),
  auditMiddleware({ entity: 'UnitOfMeasure', getNewValue: (req) => req.body }),
  validateBody(createUnitSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await unitsController.createUnit(req, getValidatedBody(req)));
  })
);

unitsRouter.patch(
  '/:id',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'UnitOfMeasure',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => unitsController.getUnitSnapshotForAudit(req.params.id),
    getNewValue: (req) => req.body,
  }),
  validateBody(updateUnitSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await unitsController.updateUnit(req, getValidatedBody(req)));
  })
);

unitsRouter.delete(
  '/:id',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'UnitOfMeasure',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => unitsController.getUnitSnapshotForAudit(req.params.id),
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await unitsController.deleteUnit(req));
  })
);
