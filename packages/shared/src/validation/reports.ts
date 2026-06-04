import { z } from 'zod';
import {
  asOfDateQuerySchema,
  asOfQuerySchema,
  dateRangeQuerySchema,
  optionalDateOnlyQuery,
  optionalUuidQuery,
  reportLimitQuerySchema,
} from './queryCommon';

export const reportDailySalesQuerySchema = dateRangeQuerySchema.extend({
  customerId: optionalUuidQuery,
  warehouseId: optionalUuidQuery,
});

export const reportStockMovementQuerySchema = dateRangeQuerySchema.extend({
  productId: optionalUuidQuery,
  warehouseId: optionalUuidQuery,
});

export const reportFastMovingQuerySchema = dateRangeQuerySchema.extend({
  limit: reportLimitQuerySchema,
  sortBy: z.enum(['value', 'quantity']).optional(),
});

export const reportReceivablesAgingQuerySchema = asOfQuerySchema;

export const reportPayablesAgingQuerySchema = asOfQuerySchema;

export const reportDateRangeOnlyQuerySchema = dateRangeQuerySchema;

export const reportBalanceSheetQuerySchema = asOfDateQuerySchema;

export const reportTaxQuerySchema = dateRangeQuerySchema.extend({
  taxProfileId: optionalUuidQuery,
});

export const reportDeadStockQuerySchema = asOfQuerySchema.extend({
  daysWithoutSale: z.coerce.number().int().min(1).max(3650).optional(),
});

export const reportSlowMovingQuerySchema = dateRangeQuerySchema.extend({
  limit: reportLimitQuerySchema,
});

export const reportGrnInvoiceReconciliationQuerySchema = asOfQuerySchema;

export const reportDashboardKpisQuerySchema = z.object({});

export const reportPurchaseVsSalesQuerySchema = dateRangeQuerySchema;

export const reportProfitByProductQuerySchema = dateRangeQuerySchema;

export const reportProfitByCustomerQuerySchema = dateRangeQuerySchema;

export const reportCashFlowQuerySchema = dateRangeQuerySchema;

export const reportTaxSummaryQuerySchema = z.object({
  dateFrom: optionalDateOnlyQuery,
  dateTo: optionalDateOnlyQuery,
});
