import { Router } from 'express';
import type { z } from 'zod';
import { loginSchema, patchAuthMeSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { validateBody } from '../../../shared/middleware/validate';
import { handle, handleBody } from '../../../shared/utils/handleRoute';
import * as authController from '../controllers/authController';

export const authRouter = Router();

authRouter.post(
  '/login',
  validateBody(loginSchema),
  handleBody((_req, body) => authController.login(body as z.infer<typeof loginSchema>))
);

authRouter.get('/me', authMiddleware, loadUser, handle(authController.getMe));

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
  handleBody(authController.patchMe)
);
