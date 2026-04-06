export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: Record<string, unknown>,
    public readonly headers?: Record<string, string>
  ) {
    super(typeof body.error === 'string' ? body.error : 'HttpError');
    this.name = 'HttpError';
  }
}
