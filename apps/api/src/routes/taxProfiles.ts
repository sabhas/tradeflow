import { Router } from 'express';
import { createTaxProfileSchema, updateTaxProfileSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../controllers/asyncHandler';
import { sendControllerResult } from '../controllers/controllerResult';
import * as taxProfilesController from '../controllers/taxProfilesController';

export const taxProfilesRouter = Router();
taxProfilesRouter.use(authMiddleware, loadUser);

taxProfilesRouter.get(
  '/',
  requirePermission('masters.tax', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await taxProfilesController.listTaxProfiles(req));
  })
);

taxProfilesRouter.post(
  '/',
  requirePermission('masters.tax', 'write'),
  auditMiddleware({ entity: 'TaxProfile', getNewValue: (req) => req.body }),
  asyncHandler(async (req, res) => {
    const parsed = createTaxProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await taxProfilesController.createTaxProfile(req, parsed.data));
  })
);

taxProfilesRouter.patch(
  '/:id',
  requirePermission('masters.tax', 'write'),
  auditMiddleware({
    entity: 'TaxProfile',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => taxProfilesController.getTaxProfileSnapshotForAudit(req.params.id),
    getNewValue: (req) => req.body,
  }),
  asyncHandler(async (req, res) => {
    const parsed = updateTaxProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await taxProfilesController.updateTaxProfile(req, parsed.data));
  })
);

taxProfilesRouter.delete(
  '/:id',
  requirePermission('masters.tax', 'write'),
  auditMiddleware({
    entity: 'TaxProfile',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => taxProfilesController.getTaxProfileSnapshotForAudit(req.params.id),
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await taxProfilesController.deleteTaxProfile(req));
  })
);
