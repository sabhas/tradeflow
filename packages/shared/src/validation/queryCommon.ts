import { z } from 'zod';

/** ISO date string YYYY-MM-DD from query params. */
export const dateOnlyQuery = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const optionalDateOnlyQuery = dateOnlyQuery.optional();

export const optionalUuidQuery = z.string().uuid().optional();

export const searchQuerySchema = z.object({
  search: z.string().optional(),
});

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const dateRangeQuerySchema = z.object({
  dateFrom: optionalDateOnlyQuery,
  dateTo: optionalDateOnlyQuery,
});

export const asOfQuerySchema = z.object({
  asOf: optionalDateOnlyQuery,
});

export const asOfDateQuerySchema = z.object({
  asOfDate: optionalDateOnlyQuery,
});

export const booleanStringQuery = z.enum(['true', 'false']);

/** Accepts true/false/1/0/yes/no from query strings. */
export const optionalBooleanStringQuery = z.preprocess((v) => {
  if (v === undefined || v === null || v === '') return undefined;
  const s = String(v).toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return 'true';
  if (s === 'false' || s === '0' || s === 'no') return 'false';
  return v;
}, booleanStringQuery.optional());

export const reportLimitQuerySchema = z.coerce.number().int().min(1).max(500).optional();
