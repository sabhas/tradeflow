import { Router } from 'express';
import { createSalespersonSchema, updateSalespersonSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
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
  validateBody(createSalespersonSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await salespersonsController.createSalesperson(req, getValidatedBody(req)));
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
  validateBody(updateSalespersonSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await salespersonsController.updateSalesperson(req, getValidatedBody(req)));
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
