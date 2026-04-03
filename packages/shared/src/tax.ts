/** Parse tax rate string (e.g. "0.15" for 15%). */
export function parseTaxRate(rateStr: string): number {
  const r = parseFloat(rateStr);
  return Number.isFinite(r) && r >= 0 ? r : 0;
}

/** Round to 4 decimal places as string (aligns with DB numeric). */
export function money4(n: number): string {
  if (!Number.isFinite(n)) return '0.0000';
  return (Math.round(n * 10000) / 10000).toFixed(4);
}

/**
 * @param grossBeforeTax - qty * unitPrice - lineDiscount (single monetary amount)
 */
export function splitTaxFromGross(
  grossBeforeTax: number,
  rate: number,
  isInclusive: boolean
): { base: number; tax: number } {
  if (grossBeforeTax <= 0) return { base: 0, tax: 0 };
  if (rate <= 0) return { base: grossBeforeTax, tax: 0 };
  if (isInclusive) {
    const base = grossBeforeTax / (1 + rate);
    return { base, tax: grossBeforeTax - base };
  }
  return { base: grossBeforeTax, tax: grossBeforeTax * rate };
}
