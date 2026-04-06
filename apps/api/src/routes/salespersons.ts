import { Router } from 'express';
import { createSalespersonSchema, updateSalespersonSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
import * as salespersonsController from '../controllers/salespersonsController';

export const salespersonsRouter = Router();
salespersonsRouter.use(authMiddleware, loadUser);

salespersonsRouter.get(
  '/',
  requirePermission('masters.salespersons', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await salespersonsController.listSalespersons(req));
  })
);

salespersonsRouter.post(
  '/',
  requirePermission('masters.salespersons', 'write'),
  auditMiddleware({ entity: 'Salesperson', getNewValue: (req) => req.body }),
  asyncHandler(async (req, res) => {
    const parsed = createSalespersonSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await salespersonsController.createSalesperson(req, parsed.data));
  })
);

salespersonsRouter.patch(
  '/:id',
  requirePermission('masters.salespersons', 'write'),
  auditMiddleware({
    entity: 'Salesperson',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => salespersonsController.getSalespersonSnapshotForAudit(req.params.id),
    getNewValue: (req) => req.body,
  }),
  asyncHandler(async (req, res) => {
    const parsed = updateSalespersonSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await salespersonsController.updateSalesperson(req, parsed.data));
  })
);

salespersonsRouter.delete(
  '/:id',
  requirePermission('masters.salespersons', 'write'),
  auditMiddleware({
    entity: 'Salesperson',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => salespersonsController.getSalespersonSnapshotForAudit(req.params.id),
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await salespersonsController.deleteSalesperson(req));
  })
);
