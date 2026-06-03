import { Router } from 'express';
import { createAccountSchema, updateAccountSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as accountsController from '../controllers/accountsController';

export const accountsRouter = Router();
accountsRouter.use(authMiddleware, loadUser);

accountsRouter.get(
  '/',
  requirePermission('accounting', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await accountsController.listAccounts(req));
  })
);

accountsRouter.get(
  '/:id/balance',
  requirePermission('accounting', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await accountsController.getAccountBalance(req));
  })
);

accountsRouter.post(
  '/',
  requirePermission('accounting', 'write'),
  auditMiddleware({ entity: 'Account', getNewValue: (req) => req.body }),
  validateBody(createAccountSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await accountsController.createAccount(req, getValidatedBody(req)));
  })
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
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await accountsController.updateAccount(req, getValidatedBody(req)));
  })
);
