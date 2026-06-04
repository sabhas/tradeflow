export function hasPerm(permissions: string[], code: string): boolean {
  return permissions.includes('*') || permissions.includes(code);
}

export function dateFromOrDefault(value: unknown, fallback = '1970-01-01'): string {
  return String(value || fallback).slice(0, 10);
}

export function dateToOrDefault(value: unknown): string {
  return String(value || new Date().toISOString().slice(0, 10)).slice(0, 10);
}

export function asOfOrDefault(value: unknown): string {
  return String(value || new Date().toISOString().slice(0, 10)).slice(0, 10);
}

export function parseLimitParam(value: unknown, defaultLimit = 50, max = 500): number {
  const rawLimit = parseInt(String(value ?? defaultLimit), 10);
  return Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), max) : defaultLimit;
}
