import { Router } from 'express';
import { paginationQuerySchema, createTaxProfileSchema, updateTaxProfileSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as taxProfilesController from '../controllers/taxProfilesController';

export const taxProfilesRouter = Router();
taxProfilesRouter.use(authMiddleware, loadUser);

taxProfilesRouter.get(
  '/',
  requirePermission('masters.tax', 'read'),
  validateQuery(paginationQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await taxProfilesController.listTaxProfiles(req));
  })
);

taxProfilesRouter.post(
  '/',
  requirePermission('masters.tax', 'write'),
  auditMiddleware({ entity: 'TaxProfile', getNewValue: (req) => req.body }),
  validateBody(createTaxProfileSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await taxProfilesController.createTaxProfile(req, getValidatedBody(req)));
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
  validateBody(updateTaxProfileSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await taxProfilesController.updateTaxProfile(req, getValidatedBody(req)));
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
