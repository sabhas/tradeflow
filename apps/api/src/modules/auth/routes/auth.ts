import { Router } from 'express';
import { loginSchema, patchAuthMeSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as authController from '../controllers/authController';

export const authRouter = Router();

authRouter.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await authController.login(getValidatedBody(req)));
  })
);

authRouter.get(
  '/me',
  authMiddleware,
  loadUser,
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await authController.getMe(req));
  })
);

authRouter.patch(
  '/me',
  authMiddleware,
  loadUser,
  auditMiddleware({
    entity: 'User',
    getEntityId: (req) => req.auth?.userId,
    getOldValue: (req) => (req.user ? { name: req.user.name, email: req.user.email } : undefined),
    getNewValue: (req) => req.body,
  }),
  validateBody(patchAuthMeSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await authController.patchMe(req, getValidatedBody(req)));
  })
);
