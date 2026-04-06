import { Router } from 'express';
import { loginSchema, patchAuthMeSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
import * as authController from '../controllers/authController';

export const authRouter = Router();

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await authController.login(parsed.data));
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
    getOldValue: (req) =>
      req.user ? { name: req.user.name, email: req.user.email } : undefined,
    getNewValue: (req) => req.body,
  }),
  asyncHandler(async (req, res) => {
    const parsed = patchAuthMeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await authController.patchMe(req, parsed.data));
  })
);
