/** Fixed-4 decimal string arithmetic for stock quantities. */
export function decimalAdd(a: string, b: string): string {
  const pa = Math.round(parseFloat(a || '0') * 10000);
  const pb = Math.round(parseFloat(b || '0') * 10000);
  return (pa + pb) / 10000 === 0 ? '0.0000' : ((pa + pb) / 10000).toFixed(4);
}

export function decimalIsNegative(s: string): boolean {
  return parseFloat(s || '0') < 0;
}

export function parseDecimalStrict(s: string): string {
  const n = parseFloat(s);
  if (!Number.isFinite(n)) throw new Error('Invalid number');
  return n.toFixed(4);
}
