/** Parse API date-only values without timezone shift (matches server normalizeDateOnly). */
export function parseApiDateOnly(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const mo = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  const m = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}
