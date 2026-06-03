import { Router } from 'express';
import { createTownSchema, updateTownSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { getValidatedBody, validateBody } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
import * as townsController from '../controllers/townsController';

export const townsRouter = Router();
townsRouter.use(authMiddleware, loadUser);

townsRouter.get(
  '/',
  requirePermission('masters.customers', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await townsController.listTowns(req));
  })
);

townsRouter.post(
  '/',
  requirePermission('masters.customers', 'write'),
  auditMiddleware({ entity: 'Town', getNewValue: (req) => req.body }),
  validateBody(createTownSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await townsController.createTown(req, getValidatedBody(req)));
  })
);

townsRouter.patch(
  '/:id',
  requirePermission('masters.customers', 'write'),
  auditMiddleware({
    entity: 'Town',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => townsController.getTownSnapshotForAudit(req.params.id),
    getNewValue: (req) => req.body,
  }),
  validateBody(updateTownSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await townsController.updateTown(req, getValidatedBody(req)));
  })
);

townsRouter.delete(
  '/:id',
  requirePermission('masters.customers', 'write'),
  auditMiddleware({
    entity: 'Town',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => townsController.getTownSnapshotForAudit(req.params.id),
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await townsController.deleteTown(req));
  })
);
