/** Tax profile fields used for line calculation (matches DB / API shape). */
export interface TaxProfileForLine {
  rate: string;
  isInclusive: boolean;
}

/** Parse tax rate string (e.g. "0.15" for 15% as a decimal multiplier). */
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

/**
 * Line amount is qty * unitPrice - lineDiscount (one monetary total for the line).
 * Rate is a decimal multiplier (e.g. 0.05 for 5%), consistent with {@link parseTaxRate}.
 */
export function computeLineTax(
  lineAmount: number,
  taxProfile: TaxProfileForLine | null | undefined,
  _options?: { roundingMode?: 'default' }
): { baseAmount: string; taxAmount: string; totalAmount: string } {
  const rate = taxProfile ? parseTaxRate(taxProfile.rate) : 0;
  const isInclusive = taxProfile?.isInclusive ?? false;
  const { base, tax } = splitTaxFromGross(lineAmount, rate, isInclusive);
  const baseAmount = money4(base);
  const taxAmount = money4(tax);
  const totalAmount = money4(parseFloat(baseAmount) + parseFloat(taxAmount));
  return { baseAmount, taxAmount, totalAmount };
}
