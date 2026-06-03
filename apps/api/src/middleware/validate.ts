import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';
import { apiErrorBody } from '../utils/apiError';

export function getValidatedBody<T>(req: Request): T {
  return req.validatedBody as T;
}

export function validateBody<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(
        apiErrorBody('Invalid input', {
          details: parsed.error.flatten(),
          requestId: req.requestId,
        })
      );
      return;
    }
    req.validatedBody = parsed.data;
    next();
  };
}

export function validateQuery<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json(
        apiErrorBody('Invalid input', {
          details: parsed.error.flatten(),
          requestId: req.requestId,
        })
      );
      return;
    }
    req.validatedQuery = parsed.data;
    next();
  };
}
