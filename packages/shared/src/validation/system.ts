import { z } from 'zod';
import {
  dateRangeQuerySchema,
  optionalDateOnlyQuery,
  optionalUuidQuery,
  paginationQuerySchema,
  searchQuerySchema,
} from './queryCommon';

export const exportProductsQuerySchema = z.object({
  categoryId: optionalUuidQuery,
  search: z.string().optional(),
});

export const exportCustomersQuerySchema = searchQuerySchema;

export const exportInvoicesQuerySchema = dateRangeQuerySchema.extend({
  customerId: optionalUuidQuery,
  status: z.enum(['draft', 'posted', 'void']).optional(),
});

export const importTemplateQuerySchema = z.object({
  format: z.enum(['xlsx', 'csv']).optional(),
});

export const listAuditLogsQuerySchema = paginationQuerySchema.extend({
  entity: z.string().optional(),
  entityId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  from: optionalDateOnlyQuery,
  to: optionalDateOnlyQuery,
  dateFrom: optionalDateOnlyQuery,
  dateTo: optionalDateOnlyQuery,
});

export const listRecycleBinQuerySchema = paginationQuerySchema.extend({
  entity: z.enum(['Product', 'Customer', 'Supplier', 'Invoice', 'JournalEntry']),
});

export const listApprovalsQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

export const periodLockQuerySchema = z.object({
  lockedThrough: optionalDateOnlyQuery,
});

export const supplierLedgerQuerySchema = z.object({
  dateFrom: optionalDateOnlyQuery,
  dateTo: optionalDateOnlyQuery,
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
