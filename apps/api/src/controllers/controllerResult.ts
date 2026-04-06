import type { Response } from 'express';

export type JsonControllerResult = { status: number; body: unknown };
export type HtmlControllerResult = { status: number; kind: 'html'; html: string };
export type ControllerResult = JsonControllerResult | HtmlControllerResult;

export function ok(body: unknown): JsonControllerResult {
  return { status: 200, body };
}

export function created(body: unknown): JsonControllerResult {
  return { status: 201, body };
}

export function withStatus(status: number, body: unknown): JsonControllerResult {
  return { status, body };
}

export function htmlOk(html: string): HtmlControllerResult {
  return { status: 200, kind: 'html', html };
}

export function sendControllerResult(res: Response, result: ControllerResult): void {
  if ('kind' in result && result.kind === 'html') {
    res.status(result.status).setHeader('Content-Type', 'text/html; charset=utf-8').send(result.html);
    return;
  }
  const json = result as JsonControllerResult;
  res.status(json.status).json(json.body);
}
