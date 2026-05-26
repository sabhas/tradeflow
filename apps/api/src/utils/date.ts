/** PostgreSQL `date` → YYYY-MM-DD (node-pg uses UTC midnight for calendar dates). */
export function toIsoDateString(value: unknown): string | undefined {
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
