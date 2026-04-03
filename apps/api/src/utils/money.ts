export function moneyAdd(a: string, b: string): string {
  const pa = Math.round(parseFloat(a || '0') * 10000);
  const pb = Math.round(parseFloat(b || '0') * 10000);
  return ((pa + pb) / 10000).toFixed(4);
}

export function moneySub(a: string, b: string): string {
  const pa = Math.round(parseFloat(a || '0') * 10000);
  const pb = Math.round(parseFloat(b || '0') * 10000);
  return ((pa - pb) / 10000).toFixed(4);
}

export function moneyIsNegative(a: string): boolean {
  return parseFloat(a || '0') < 0;
}

export function moneyCmp(a: string, b: string): number {
  return parseFloat(a || '0') - parseFloat(b || '0');
}
