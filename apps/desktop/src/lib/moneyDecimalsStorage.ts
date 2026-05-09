export const MONEY_DECIMALS_STORAGE_KEY = 'tradeflow_money_decimals';

/** Matches Settings UI and API validation (0–6). */
export function clampMoneyDecimals(value: number): number {
  const n = Math.round(Number.isFinite(value) ? value : 2);
  return Math.max(0, Math.min(6, n));
}

export function readStoredMoneyDecimals(): number {
  try {
    const raw = localStorage.getItem(MONEY_DECIMALS_STORAGE_KEY);
    if (raw == null || raw === '') return 2;
    return clampMoneyDecimals(Number(raw));
  } catch {
    return 2;
  }
}

export function writeStoredMoneyDecimals(value: number): void {
  try {
    localStorage.setItem(MONEY_DECIMALS_STORAGE_KEY, String(clampMoneyDecimals(value)));
  } catch {
    /* ignore */
  }
}
