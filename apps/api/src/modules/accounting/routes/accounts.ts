import { Router } from 'express';
import {
  accountBalanceQuerySchema,
  createAccountSchema,
  listAccountsQuerySchema,
  updateAccountSchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { handle, handleBody } from '../../../shared/utils/handleRoute';
import * as accountsController from '../controllers/accountsController';

export const accountsRouter = Router();
accountsRouter.use(authMiddleware, loadUser);

accountsRouter.get(
  '/',
  requirePermission('accounting', 'read'),
  validateQuery(listAccountsQuerySchema),
  handle(accountsController.listAccounts)
);

accountsRouter.get(
  '/:id/balance',
  requirePermission('accounting', 'read'),
  validateQuery(accountBalanceQuerySchema),
  handle(accountsController.getAccountBalance)
);

accountsRouter.post(
  '/',
  requirePermission('accounting', 'write'),
  auditMiddleware({ entity: 'Account', getNewValue: (req) => req.body }),
  validateBody(createAccountSchema),
  handleBody(accountsController.createAccount)
);

accountsRouter.patch(
  '/:id',
  requirePermission('accounting', 'write'),
  auditMiddleware({
    entity: 'Account',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  validateBody(updateAccountSchema),
  handleBody(accountsController.updateAccount)
);
