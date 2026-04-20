export function formatNumberString(value: string | number, decimalPlaces: number): string {
  const numericValue = Number(value);
  const safeDecimalPlaces = Math.max(0, Math.min(20, Math.trunc(decimalPlaces)));

  if (!Number.isFinite(numericValue)) {
    return safeDecimalPlaces === 0 ? '0' : (0).toFixed(safeDecimalPlaces);
  }

  return numericValue.toFixed(safeDecimalPlaces);
}
