export function formatNumberString(value: string | number, decimalPlaces: number): string {
  const normalized = typeof value === 'string' ? value.replace(/,/g, '').trim() : value;
  const numericValue = Number(normalized);
  const safeDecimalPlaces = Math.max(0, Math.min(20, Math.trunc(decimalPlaces)));

  if (!Number.isFinite(numericValue)) {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: safeDecimalPlaces,
      maximumFractionDigits: safeDecimalPlaces,
    }).format(0);
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: safeDecimalPlaces,
    maximumFractionDigits: safeDecimalPlaces,
  }).format(numericValue);
}
