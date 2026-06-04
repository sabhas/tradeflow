import type { Request, RequestHandler } from 'express';
import { getValidatedBody } from '../middleware/validate';
import { asyncHandler } from './asyncHandler';
import { sendControllerResult, type ControllerResult } from './controllerResult';

/** Wraps a controller that only needs `req` — replaces asyncHandler + sendControllerResult. */
export function handle(fn: (req: Request) => Promise<ControllerResult>): RequestHandler {
  return asyncHandler(async (req, res) => {
    sendControllerResult(res, await fn(req));
  });
}

/** Wraps a controller that reads validated body via validateBody middleware. */
export function handleBody<T>(fn: (req: Request, body: T) => Promise<ControllerResult>): RequestHandler {
  return asyncHandler(async (req, res) => {
    sendControllerResult(res, await fn(req, getValidatedBody<T>(req)));
  });
}
