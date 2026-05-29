import { Router } from 'express';
import { createBonusRuleSchema, updateBonusRuleSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
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
  asyncHandler(async (req, res) => {
    const parsed = createBonusRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await bonusRulesController.createBonusRule(req, parsed.data));
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
  asyncHandler(async (req, res) => {
    const parsed = updateBonusRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await bonusRulesController.updateBonusRule(req, parsed.data));
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
