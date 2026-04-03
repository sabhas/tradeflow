import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { dataSource } from '@tradeflow/db';
import { User } from '@tradeflow/db';

export interface AuthPayload {
  userId: string;
  email: string;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
      user?: User;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Unauthorized', message: 'Token required' });
    return;
  }

  const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
  try {
    const decoded = jwt.verify(token, secret) as { userId: string; email: string; permissions: string[] };
    req.auth = {
      userId: decoded.userId,
      email: decoded.email,
      permissions: decoded.permissions || [],
    };
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
}

/** Permissions from JWT (login time). Routes without `loadUser` rely on this only. */
function permissionsFromJwt(req: Request): string[] {
  return req.auth?.permissions ?? [];
}

/** Current permissions from DB when `loadUser` ran; matches GET /auth/me and login. */
function permissionsFromUser(req: Request): string[] | null {
  const user = req.user;
  if (!user?.roles?.length) return null;
  return [
    ...new Set((user.roles || []).flatMap((r) => (r.permissions || []).map((p) => p.code))),
  ];
}

/**
 * Prefer role permissions from the database when `loadUser` populated `req.user`
 * (same source as `/auth/me`). If the user has roles but zero permission codes (relation
 * not loaded or empty join), fall back to JWT — same effective behavior as JWT-only checks
 * before DB-aware auth. Routes without `loadUser` use JWT only.
 */
function effectivePermissions(req: Request): string[] {
  const fromJwt = permissionsFromJwt(req);
  const fromDb = permissionsFromUser(req);
  if (fromDb === null) {
    return fromJwt;
  }
  if (fromDb.length > 0) {
    return fromDb;
  }
  return fromJwt;
}

export function requirePermission(resource: string, action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const permission = `${resource}:${action}`;
    const perms = effectivePermissions(req);
    if (!perms.includes(permission) && !perms.includes('*')) {
      res.status(403).json({ error: 'Forbidden', message: `Permission ${permission} required` });
      return;
    }
    next();
  };
}

export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth?.userId) return next();
  try {
    const userRepo = dataSource.getRepository(User);
    const user = await userRepo.findOne({
      where: { id: req.auth.userId },
      relations: ['roles', 'roles.permissions'],
    });
    req.user = user ?? undefined;
  } catch {
    // ignore
  }
  next();
}
