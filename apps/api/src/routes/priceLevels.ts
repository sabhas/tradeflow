import { Router } from 'express';
import { createPriceLevelSchema, updatePriceLevelSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../controllers/asyncHandler';
import { sendControllerResult } from '../controllers/controllerResult';
import * as priceLevelsController from '../controllers/priceLevelsController';

export const priceLevelsRouter = Router();
priceLevelsRouter.use(authMiddleware, loadUser);

priceLevelsRouter.get(
  '/',
  requirePermission('masters.products', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await priceLevelsController.listPriceLevels(req));
  })
);

priceLevelsRouter.post(
  '/',
  requirePermission('masters.products', 'write'),
  auditMiddleware({ entity: 'PriceLevel', getNewValue: (req) => req.body }),
  asyncHandler(async (req, res) => {
    const parsed = createPriceLevelSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await priceLevelsController.createPriceLevel(req, parsed.data));
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
  asyncHandler(async (req, res) => {
    const parsed = updatePriceLevelSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await priceLevelsController.updatePriceLevel(req, parsed.data));
  })
);
