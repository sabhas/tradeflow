import {
  calculateBonusQuerySchema,
  createBonusRuleSchema,
  listBonusRulesQuerySchema,
  updateBonusRuleSchema,
} from '@tradeflow/shared';
import { requirePermission } from '../../../shared/middleware/auth';
import { createCrudRouter } from '../../../shared/routing/createCrudRouter';
import { validateQuery } from '../../../shared/middleware/validate';
import { handle } from '../../../shared/utils/handleRoute';
import * as bonusRulesController from '../controllers/bonusRulesController';

export const bonusRulesRouter = createCrudRouter({
  permission: { module: 'masters.products', read: 'read', write: 'write' },
  auditEntity: 'BonusRule',
  createSchema: createBonusRuleSchema,
  updateSchema: updateBonusRuleSchema,
  listQuerySchema: listBonusRulesQuerySchema,
  controller: {
    list: bonusRulesController.listBonusRules,
    create: bonusRulesController.createBonusRule,
    update: bonusRulesController.updateBonusRule,
    delete: bonusRulesController.deleteBonusRule,
    getSnapshotForAudit: bonusRulesController.getBonusRuleSnapshotForAudit,
  },
});

bonusRulesRouter.get(
  '/calculate',
  requirePermission('sales', 'read'),
  validateQuery(calculateBonusQuerySchema),
  handle(bonusRulesController.calculateBonusAction)
);
