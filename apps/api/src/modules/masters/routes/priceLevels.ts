import { Router } from 'express';
import { paginationQuerySchema, createPriceLevelSchema, updatePriceLevelSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as priceLevelsController from '../controllers/priceLevelsController';

export const priceLevelsRouter = Router();
priceLevelsRouter.use(authMiddleware, loadUser);

priceLevelsRouter.get(
  '/',
  requirePermission('masters.products', 'read'),
  validateQuery(paginationQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await priceLevelsController.listPriceLevels(req));
  })
);

priceLevelsRouter.post(
  '/',
  requirePermission('masters.products', 'write'),
  auditMiddleware({ entity: 'PriceLevel', getNewValue: (req) => req.body }),
  validateBody(createPriceLevelSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await priceLevelsController.createPriceLevel(req, getValidatedBody(req)));
  })
);

priceLevelsRouter.patch(
  '/:id',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'PriceLevel',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => priceLevelsController.getPriceLevelSnapshotForAudit(req.params.id),
    getNewValue: (req) => req.body,
  }),
  validateBody(updatePriceLevelSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await priceLevelsController.updatePriceLevel(req, getValidatedBody(req)));
  })
);
