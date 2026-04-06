import type { Request } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import type { z } from 'zod';
import { dataSource } from '@tradeflow/db';
import { Branch, User, UserBranch } from '@tradeflow/db';
import { loginSchema, patchAuthMeSchema } from '@tradeflow/shared';
import { ok, type ControllerResult } from './controllerResult';
import { HttpError } from './httpError';

type LoginInput = z.infer<typeof loginSchema>;
type PatchAuthMeInput = z.infer<typeof patchAuthMeSchema>;

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
): Promise<Array<{ branchId: string; name: string; code: string; isDefault: boolean }>> {
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

function permissionsForUser(user: User): string[] {
  return [...new Set((user.roles || []).flatMap((r) => (r.permissions || []).map((p) => p.code)))];
}

export async function login(body: LoginInput): Promise<ControllerResult> {
  const { email, password } = body;
  const key = loginKey(email);
  const blocked = isLoginBlocked(key);
  if (blocked.blocked && blocked.retryAfterSec) {
    throw new HttpError(
      429,
      { error: 'Too many login attempts', message: 'Try again later' },
      { 'Retry-After': String(blocked.retryAfterSec) }
    );
  }

  const userRepo = dataSource.getRepository(User);

  const user = await userRepo.findOne({
    where: { email: email.toLowerCase() },
    relations: ['roles', 'roles.permissions'],
  });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    const fail = registerFailedLogin(key);
    if (fail.blocked && fail.retryAfterSec) {
      throw new HttpError(
        429,
        { error: 'Too many login attempts', message: 'Try again later' },
        { 'Retry-After': String(fail.retryAfterSec) }
      );
    }
    throw new HttpError(401, { error: 'Invalid credentials' });
  }

  clearLoginAttempts(key);

  const permissions = permissionsForUser(user);

  const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
  const signOptions: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'],
  };
  const accessToken = jwt.sign({ userId: user.id, email: user.email, permissions }, secret, signOptions);

  const branches = await loadBranchesForUser(user.id, user.branchId);

  return ok({
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
}

export async function getMe(req: Request): Promise<ControllerResult> {
  if (!req.user || !req.auth) {
    throw new HttpError(401, { error: 'Unauthorized' });
  }
  const permissions = permissionsForUser(req.user);
  const branches = await loadBranchesForUser(req.user.id, req.user.branchId);
  return ok({
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

export async function patchMe(req: Request, b: PatchAuthMeInput): Promise<ControllerResult> {
  if (!req.user || !req.auth) {
    throw new HttpError(401, { error: 'Unauthorized' });
  }

  if (b.name !== undefined) {
    req.user.name = b.name.trim();
  }

  if (b.branchId !== undefined && b.branchId !== null) {
    const allowed = await dataSource.getRepository(UserBranch).findOne({
      where: { userId: req.user.id, branchId: b.branchId },
    });
    if (!allowed) {
      throw new HttpError(403, { error: 'You do not have access to this branch' });
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

  const permissions = permissionsForUser(req.user);
  const branches = await loadBranchesForUser(req.user.id, req.user.branchId);
  return ok({
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
