import type { ValueTransformer } from 'typeorm';

/** PostgreSQL `date` → YYYY-MM-DD without timezone shift (node-pg uses UTC midnight). */
export function normalizeDateOnly(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return undefined;
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : undefined;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    const y = value.getUTCFullYear();
    const mo = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  return undefined;
}

export const dateOnlyColumnTransformer: ValueTransformer = {
  to: (value: string | null | undefined) => {
    if (value == null || value === '') return null;
    return normalizeDateOnly(value) ?? null;
  },
  from: (value: string | Date | null) => normalizeDateOnly(value),
};
