export interface ApiErrorBody {
  error: string;
  message?: string;
  details?: unknown;
  requestId?: string;
}

export function apiErrorBody(
  error: string,
  options?: { message?: string; details?: unknown; requestId?: string }
): ApiErrorBody {
  const body: ApiErrorBody = { error };
  if (options?.message) body.message = options.message;
  if (options?.details !== undefined) body.details = options.details;
  if (options?.requestId) body.requestId = options.requestId;
  return body;
}
