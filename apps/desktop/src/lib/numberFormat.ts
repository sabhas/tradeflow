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

export function parseAmount(value: AmountValue, invalid: InvalidAmountStrategy = 'zero'): number {
  const raw = String(normalizeNumericLike(value));
  const n = Number(raw || '0');
  if (Number.isFinite(n)) return n;
  return invalid === 'nan' ? NaN : 0;
}

// Keep only digits and one decimal point while user is typing.
export function normalizeAmountInput(raw: string): string {
  const cleaned = raw.replace(/,/g, '').replace(/[^\d.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, '')}`;
}

// Adds grouping separators but preserves in-progress input states (e.g. trailing ".").
export function formatAmountInput(raw: string): string {
  if (!raw) return '';
  const cleaned = normalizeAmountInput(raw);
  if (!cleaned) return '';

  const hasTrailingDot = cleaned.endsWith('.');
  const [whole, frac = ''] = cleaned.split('.');
  const wholeFormatted = whole ? Number(whole).toLocaleString() : '0';

  if (hasTrailingDot) return `${wholeFormatted}.`;
  return frac ? `${wholeFormatted}.${frac}` : wholeFormatted;
}
