import { Router } from 'express';
import { createAreaSchema, updateAreaSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { getValidatedBody, validateBody } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
import * as areasController from '../controllers/areasController';

export const areasRouter = Router();
areasRouter.use(authMiddleware, loadUser);

areasRouter.get(
  '/',
  requirePermission('masters.customers', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await areasController.listAreas(req));
  })
);

areasRouter.post(
  '/',
  requirePermission('masters.customers', 'write'),
  auditMiddleware({ entity: 'Area', getNewValue: (req) => req.body }),
  validateBody(createAreaSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await areasController.createArea(req, getValidatedBody(req)));
  })
);

areasRouter.patch(
  '/:id',
  requirePermission('masters.customers', 'write'),
  auditMiddleware({
    entity: 'Area',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => areasController.getAreaSnapshotForAudit(req.params.id),
    getNewValue: (req) => req.body,
  }),
  validateBody(updateAreaSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await areasController.updateArea(req, getValidatedBody(req)));
  })
);

areasRouter.delete(
  '/:id',
  requirePermission('masters.customers', 'write'),
  auditMiddleware({
    entity: 'Area',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => areasController.getAreaSnapshotForAudit(req.params.id),
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await areasController.deleteArea(req));
  })
);
