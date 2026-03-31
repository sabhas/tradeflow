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

export function requirePermission(resource: string, action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const permission = `${resource}:${action}`;
    if (!req.auth.permissions.includes(permission) && !req.auth.permissions.includes('*')) {
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
