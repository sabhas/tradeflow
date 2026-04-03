import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { dataSource } from '@tradeflow/db';
import { Branch, User, UserBranch } from '@tradeflow/db';
import { loginSchema, patchAuthMeSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';

export const authRouter = Router();

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;

type LoginAttemptState = { count: number; resetAt: number };
const loginAttempts = new Map<string, LoginAttemptState>();

function loginKey(email: string): string {
  return email.toLowerCase().trim();
}

function isLoginBlocked(key: string): { blocked: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const s = loginAttempts.get(key);
  if (!s || now > s.resetAt) return { blocked: false };
  if (s.count >= LOGIN_MAX_ATTEMPTS) {
    return { blocked: true, retryAfterSec: Math.max(1, Math.ceil((s.resetAt - now) / 1000)) };
  }
  return { blocked: false };
}

function registerFailedLogin(key: string): { blocked: boolean; retryAfterSec?: number } {
  const now = Date.now();
  let s = loginAttempts.get(key);
  if (!s || now > s.resetAt) {
    s = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
    loginAttempts.set(key, s);
  }
  s.count += 1;
  if (s.count >= LOGIN_MAX_ATTEMPTS) {
    return { blocked: true, retryAfterSec: Math.max(1, Math.ceil((s.resetAt - now) / 1000)) };
  }
  return { blocked: false };
}

function clearLoginAttempts(key: string): void {
  loginAttempts.delete(key);
}

async function loadBranchesForUser(
  userId: string,
  fallbackBranchId?: string | null
): Promise<
  Array<{ branchId: string; name: string; code: string; isDefault: boolean }>
> {
  const rows = await dataSource.getRepository(UserBranch).find({
    where: { userId },
    relations: ['branch'],
    order: { isDefault: 'DESC' },
  });
  const mapped = rows
    .filter((r) => r.branch)
    .map((r) => ({
      branchId: r.branchId,
      name: r.branch!.name,
      code: r.branch!.code,
      isDefault: r.isDefault,
    }));
  if (mapped.length > 0) return mapped;
  if (fallbackBranchId) {
    const b = await dataSource.getRepository(Branch).findOne({ where: { id: fallbackBranchId } });
    if (b) {
      return [{ branchId: fallbackBranchId, name: b.name, code: b.code, isDefault: true }];
    }
  }
  return [];
}

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const { email, password } = parsed.data;
  const key = loginKey(email);
  const blocked = isLoginBlocked(key);
  if (blocked.blocked && blocked.retryAfterSec) {
    res.setHeader('Retry-After', String(blocked.retryAfterSec));
    res.status(429).json({ error: 'Too many login attempts', message: 'Try again later' });
    return;
  }

  const userRepo = dataSource.getRepository(User);

  const user = await userRepo.findOne({
    where: { email: email.toLowerCase() },
    relations: ['roles', 'roles.permissions'],
  });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    const fail = registerFailedLogin(key);
    if (fail.blocked && fail.retryAfterSec) {
      res.setHeader('Retry-After', String(fail.retryAfterSec));
      res.status(429).json({ error: 'Too many login attempts', message: 'Try again later' });
      return;
    }
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  clearLoginAttempts(key);

  const permissions = [
    ...new Set(
      (user.roles || []).flatMap((r) => (r.permissions || []).map((p) => p.code))
    ),
  ];

  const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
  const signOptions: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'],
  };
  const accessToken = jwt.sign({ userId: user.id, email: user.email, permissions }, secret, signOptions);

  const branches = await loadBranchesForUser(user.id, user.branchId);

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
    branches,
    permissions,
  });
});

authRouter.get('/me', authMiddleware, loadUser, async (req, res) => {
  if (!req.user || !req.auth) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const permissions = [
    ...new Set(
      (req.user.roles || []).flatMap((r) => (r.permissions || []).map((p) => p.code))
    ),
  ];
  const branches = await loadBranchesForUser(req.user.id, req.user.branchId);
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      branchId: req.user.branchId,
      createdAt: req.user.createdAt,
      updatedAt: req.user.updatedAt,
    },
    branches,
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
    const parsed = patchAuthMeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;

    if (b.name !== undefined) {
      req.user.name = b.name.trim();
    }

    if (b.branchId !== undefined && b.branchId !== null) {
      const allowed = await dataSource.getRepository(UserBranch).findOne({
        where: { userId: req.user.id, branchId: b.branchId },
      });
      if (!allowed) {
        res.status(403).json({ error: 'You do not have access to this branch' });
        return;
      }
      req.user.branchId = b.branchId;
      await dataSource.transaction(async (manager) => {
        await manager.getRepository(User).save(req.user!);
        await manager
          .createQueryBuilder()
          .update(UserBranch)
          .set({ isDefault: false })
          .where('user_id = :uid', { uid: req.user!.id })
          .execute();
        await manager
          .createQueryBuilder()
          .update(UserBranch)
          .set({ isDefault: true })
          .where('user_id = :uid AND branch_id = :bid', { uid: req.user!.id, bid: b.branchId })
          .execute();
      });
    } else if (b.name !== undefined) {
      await dataSource.getRepository(User).save(req.user);
    }

    const permissions = [
      ...new Set(
        (req.user.roles || []).flatMap((r) =>
          (r.permissions || []).map((p) => p.code)
        ),
      ),
    ];
    const branches = await loadBranchesForUser(req.user.id, req.user.branchId);
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        branchId: req.user.branchId,
        createdAt: req.user.createdAt,
        updatedAt: req.user.updatedAt,
      },
      branches,
      permissions,
    });
  }
);
