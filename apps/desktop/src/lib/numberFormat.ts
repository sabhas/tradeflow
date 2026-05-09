type AmountValue = string | number | null | undefined;

type InvalidAmountStrategy = 'zero' | 'nan';

// Accept numeric strings that may already include grouping separators.
function normalizeNumericLike(value: AmountValue): string | number {
  return typeof value === 'string' ? value.replace(/,/g, '').trim() : value ?? 0;
}

// Intl.NumberFormat supports fraction digits in the inclusive range 0..20.
function clampFractionDigits(value: number): number {
  return Math.max(0, Math.min(20, Math.trunc(value)));
}

export function formatAmount(value: AmountValue, fractionDigits = 2): string {
  const numericValue = Number(normalizeNumericLike(value));
  const safeDigits = clampFractionDigits(fractionDigits);

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: safeDigits,
    maximumFractionDigits: safeDigits,
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

/** Same as `formatAmount` but never inserts grouping separators — for controlled `<input>` values. */
export function formatAmountPlain(value: AmountValue, fractionDigits: number): string {
  const numericValue = Number(normalizeNumericLike(value));
  const safeDigits = clampFractionDigits(fractionDigits);

  return new Intl.NumberFormat('en-US', {
    useGrouping: false,
    minimumFractionDigits: safeDigits,
    maximumFractionDigits: safeDigits,
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

export function parseAmount(value: AmountValue, invalid: InvalidAmountStrategy = 'zero'): number {
  const raw = String(normalizeNumericLike(value));
  const n = Number(raw || '0');
  if (Number.isFinite(n)) return n;
  return invalid === 'nan' ? NaN : 0;
}

// Keep only digits and one decimal point while user is typing.
export function normalizeAmountInput(raw: string, maxFractionDigits = 2): string {
  const cleaned = raw.replace(/,/g, '').replace(/[^\d.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  const intPart = cleaned.slice(0, firstDot);
  const fracAll = cleaned.slice(firstDot + 1).replace(/\./g, '');
  const cap = clampFractionDigits(maxFractionDigits);
  if (cap <= 0) {
    return intPart;
  }
  const truncated = fracAll.slice(0, cap);
  const hadTrailingDotOnly = cleaned.endsWith('.') && fracAll.length === 0;
  if (hadTrailingDotOnly) {
    return `${intPart}.`;
  }
  if (truncated.length === 0) {
    return intPart;
  }
  return `${intPart}.${truncated}`;
}

// Adds grouping separators but preserves in-progress input states (e.g. trailing ".").
export function formatAmountInput(raw: string, maxFractionDigits = 2): string {
  if (!raw) return '';
  const cleaned = normalizeAmountInput(raw, maxFractionDigits);
  if (!cleaned) return '';

  const hasTrailingDot = cleaned.endsWith('.');
  const [whole, frac = ''] = cleaned.split('.');
  const wholeFormatted = whole ? Number(whole).toLocaleString() : '0';

  if (hasTrailingDot) return `${wholeFormatted}.`;
  return frac ? `${wholeFormatted}.${frac}` : wholeFormatted;
}
