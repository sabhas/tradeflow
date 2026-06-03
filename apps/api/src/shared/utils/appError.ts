import { HttpError } from './httpError';

export class AppError extends HttpError {
  constructor(
    statusCode: number,
    public readonly code: string,
    message: string,
    details?: unknown,
    headers?: Record<string, string>
  ) {
    super(statusCode, { error: code, message, details }, headers);
    this.name = 'AppError';
  }
}

export function notFound(entity?: string): AppError {
  return new AppError(404, 'NOT_FOUND', entity ? `${entity} not found` : 'Not found');
}

export function draftOnly(entity: string): AppError {
  return new AppError(400, 'DRAFT_ONLY', `Only draft ${entity}s can be edited`);
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, 'BAD_REQUEST', message, details);
}

export function forbidden(message: string): AppError {
  return new AppError(403, 'FORBIDDEN', message);
}

/** Maps a plain Error message to an HTTP error (used by the global error handler). */
export function appErrorFromMessage(message: string): AppError {
  if (message === 'Not found') {
    return notFound();
  }
  return badRequest(message);
}
