import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './httpError';

/**
 * Wraps an async route handler; maps {@link HttpError} to JSON responses and forwards other errors to Express.
 */
export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch((err: unknown) => {
      if (err instanceof HttpError) {
        if (err.headers) {
          for (const [k, v] of Object.entries(err.headers)) {
            res.setHeader(k, v);
          }
        }
        res.status(err.statusCode).json({
          ...err.body,
          requestId: req.requestId,
        });
        return;
      }
      next(err);
    });
  };
}
