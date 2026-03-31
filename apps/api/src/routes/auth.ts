import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { dataSource } from '@tradeflow/db';
import { User } from '@tradeflow/db';
import { loginSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const { email, password } = parsed.data;
  const userRepo = dataSource.getRepository(User);

  const user = await userRepo.findOne({
    where: { email: email.toLowerCase() },
    relations: ['roles', 'roles.permissions'],
  });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const permissions = [
    ...new Set(
      (user.roles || []).flatMap((r) => (r.permissions || []).map((p) => p.code))
    ),
  ];

  const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
  const accessToken = jwt.sign(
    { userId: user.id, email: user.email, permissions },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.json({
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      branchId: user.branchId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    permissions,
  });
});

authRouter.get('/me', authMiddleware, loadUser, (req, res) => {
  if (!req.user || !req.auth) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const permissions = [
    ...new Set(
      (req.user.roles || []).flatMap((r) => (r.permissions || []).map((p) => p.code))
    ),
  ];
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      branchId: req.user.branchId,
      createdAt: req.user.createdAt,
      updatedAt: req.user.updatedAt,
    },
    permissions,
  });
});

authRouter.patch(
  '/me',
  authMiddleware,
  loadUser,
  auditMiddleware({
    entity: 'User',
    getEntityId: (req) => req.auth?.userId,
    getOldValue: (req) =>
      req.user
        ? { name: req.user.name, email: req.user.email }
        : undefined,
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    if (!req.user || !req.auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { name } = req.body as { name?: string };
    if (name && typeof name === 'string' && name.trim()) {
      req.user.name = name.trim();
      await dataSource.getRepository(User).save(req.user);
    }
    const permissions = [
      ...new Set(
        (req.user.roles || []).flatMap((r) =>
          (r.permissions || []).map((p) => p.code)
        ),
      ),
    ];
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        branchId: req.user.branchId,
        createdAt: req.user.createdAt,
        updatedAt: req.user.updatedAt,
      },
      permissions,
    });
  }
);
