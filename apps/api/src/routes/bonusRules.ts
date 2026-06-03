import { Router } from 'express';
import { createBonusRuleSchema, updateBonusRuleSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { getValidatedBody, validateBody } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
import * as bonusRulesController from '../controllers/bonusRulesController';

export const bonusRulesRouter = Router();
bonusRulesRouter.use(authMiddleware, loadUser);

bonusRulesRouter.get(
  '/calculate',
  requirePermission('sales', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await bonusRulesController.calculateBonusAction(req));
  })
);

bonusRulesRouter.get(
  '/',
  requirePermission('masters.products', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await bonusRulesController.listBonusRules(req));
  })
);

bonusRulesRouter.post(
  '/',
  requirePermission('masters.products', 'write'),
  auditMiddleware({ entity: 'BonusRule', getNewValue: (req) => req.body }),
  validateBody(createBonusRuleSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await bonusRulesController.createBonusRule(req, getValidatedBody(req)));
  })
);

bonusRulesRouter.patch(
  '/:id',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'BonusRule',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => bonusRulesController.getBonusRuleSnapshotForAudit(req.params.id),
    getNewValue: (req) => req.body,
  }),
  validateBody(updateBonusRuleSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await bonusRulesController.updateBonusRule(req, getValidatedBody(req)));
  })
);

bonusRulesRouter.delete(
  '/:id',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'BonusRule',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => bonusRulesController.getBonusRuleSnapshotForAudit(req.params.id),
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await bonusRulesController.deleteBonusRule(req));
  })
);
