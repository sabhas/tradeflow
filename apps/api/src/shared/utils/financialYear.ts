/** Label for the financial year containing `now`, e.g. FY2026 (year = FY start calendar year). */
export function computeFinancialYearLabel(
  now: Date,
  financialYearStartMonth: number,
  override?: string | null
): string {
  const o = override?.trim();
  if (o) return o;
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  const start = Math.min(12, Math.max(1, financialYearStartMonth));
  const fyStartYear = m >= start ? y : y - 1;
  return `FY${fyStartYear}`;
}
