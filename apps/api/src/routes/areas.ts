import { Router } from 'express';
import { createAreaSchema, updateAreaSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
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
  asyncHandler(async (req, res) => {
    const parsed = createAreaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await areasController.createArea(req, parsed.data));
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
  asyncHandler(async (req, res) => {
    const parsed = updateAreaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await areasController.updateArea(req, parsed.data));
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
