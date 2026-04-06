import { Router } from 'express';
import { createUnitSchema, updateUnitSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../controllers/asyncHandler';
import { sendControllerResult } from '../controllers/controllerResult';
import * as unitsController from '../controllers/unitsController';

export const unitsRouter = Router();
unitsRouter.use(authMiddleware, loadUser);

unitsRouter.get(
  '/',
  requirePermission('masters.products', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await unitsController.listUnits(req));
  })
);

unitsRouter.post(
  '/',
  requirePermission('masters.products', 'write'),
  auditMiddleware({ entity: 'UnitOfMeasure', getNewValue: (req) => req.body }),
  asyncHandler(async (req, res) => {
    const parsed = createUnitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await unitsController.createUnit(req, parsed.data));
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
  asyncHandler(async (req, res) => {
    const parsed = updateUnitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await unitsController.updateUnit(req, parsed.data));
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
