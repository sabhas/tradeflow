import { Router } from 'express';
import { createAccountSchema, updateAccountSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
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
  asyncHandler(async (req, res) => {
    const parsed = createAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await accountsController.createAccount(req, parsed.data));
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
  asyncHandler(async (req, res) => {
    const parsed = updateAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await accountsController.updateAccount(req, parsed.data));
  })
);
