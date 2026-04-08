// @ts-nocheck
import type { Request } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import type { z } from 'zod';
import { User } from '@tradeflow/db';
import { loginSchema, patchAuthMeSchema } from '@tradeflow/shared';
import { ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

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

  const userRepo = User.getRepository();

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

  return ok({
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    permissions,
  });
}

export async function getMe(req: Request): Promise<ControllerResult> {
  if (!req.user || !req.auth) {
    throw new HttpError(401, { error: 'Unauthorized' });
  }
  const permissions = permissionsForUser(req.user);
  return ok({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      createdAt: req.user.createdAt,
      updatedAt: req.user.updatedAt,
    },
    permissions,
  });
}

export async function patchMe(req: Request, b: PatchAuthMeInput): Promise<ControllerResult> {
  if (!req.user || !req.auth) {
    throw new HttpError(401, { error: 'Unauthorized' });
  }

  if (b.name !== undefined) {
    req.user.name = b.name.trim();
    await User.save(req.user);
  }

  const permissions = permissionsForUser(req.user);
  return ok({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      createdAt: req.user.createdAt,
      updatedAt: req.user.updatedAt,
    },
    permissions,
  });
}
