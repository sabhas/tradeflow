import type { NextFunction, Request, Response } from 'express';
import { config } from '../../config';
import { logger } from '../../logger';
import { apiErrorBody } from '../utils/apiError';
import { appErrorFromMessage } from '../utils/appError';
import { HttpError } from '../utils/httpError';
import { mapDbError } from '../utils/mapDbError';

function sendHttpError(res: Response, req: Request, err: HttpError): void {
  const body = { ...err.body, requestId: req.requestId };
  if (err.headers) {
    for (const [k, v] of Object.entries(err.headers)) {
      res.setHeader(k, v);
    }
  }
  res.status(err.statusCode).json(body);
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json(apiErrorBody('Not found', { message: 'Route not found' }));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;

  if (err instanceof HttpError) {
    sendHttpError(res, req, err);
    return;
  }

  const db = mapDbError(err);
  if (db) {
    sendHttpError(res, req, db);
    return;
  }

  if (err instanceof Error && err.message) {
    sendHttpError(res, req, appErrorFromMessage(err.message));
    return;
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  logger.error({ err, requestId: req.requestId, path: req.path }, 'Unhandled error');

  const body = apiErrorBody('Internal server error', {
    message: config.NODE_ENV === 'development' ? message : undefined,
    requestId: req.requestId,
  });

  if (config.NODE_ENV === 'development' && err instanceof Error && err.stack) {
    Object.assign(body, { stack: err.stack });
  }

  res.status(500).json(body);
}
