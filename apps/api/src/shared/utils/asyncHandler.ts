import type { NextFunction, Request, Response } from 'express';

/** Wraps an async route handler and forwards errors to Express error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}
