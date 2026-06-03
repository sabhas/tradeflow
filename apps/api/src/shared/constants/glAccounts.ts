/**
 * System GL account codes used across the API.
 *
 * Keep these aligned with the seeded chart of accounts in `packages/db/src/seed.ts`.
 */
export const GL_ACCOUNT_CODES = {
  AR_TRADE: '1100',
  AP_TRADE: '2000',
  ACCRUED_PURCHASES: '2050',
  SALES: '4000',
  /** Contra-income: sales returns & allowances (matches seeded COA 4200). */
  SALES_RETURNS: '4200',
  TAX_PAYABLE: '2100',
  INVENTORY: '1210',
  INPUT_VAT: '1400',
  COGS: '5000',
} as const;
