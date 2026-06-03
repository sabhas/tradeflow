import type { Request } from 'express';

export function hasPerm(req: Request, code: string): boolean {
  const p = req.auth?.permissions ?? [];
  return p.includes('*') || p.includes(code);
}

export function queryDateFrom(req: Request, fallback = '1970-01-01'): string {
  return ((req.query.dateFrom as string) || fallback).slice(0, 10);
}

export function queryDateTo(req: Request): string {
  return ((req.query.dateTo as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
}

export function queryAsOf(req: Request): string {
  return ((req.query.asOf as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
}

export function parseLimit(req: Request, defaultLimit = 50, max = 500): number {
  const rawLimit = parseInt(String(req.query.limit || String(defaultLimit)), 10);
  return Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), max) : defaultLimit;
}
