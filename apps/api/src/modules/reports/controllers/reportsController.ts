import type { Request } from 'express';
import type { z } from 'zod';
import {
  reportBalanceSheetQuerySchema,
  reportDailySalesQuerySchema,
  reportDateRangeOnlyQuerySchema,
  reportDeadStockQuerySchema,
  reportFastMovingQuerySchema,
  reportGrnInvoiceReconciliationQuerySchema,
  reportPayablesAgingQuerySchema,
  reportProfitByCustomerQuerySchema,
  reportProfitByProductQuerySchema,
  reportPurchaseVsSalesQuerySchema,
  reportReceivablesAgingQuerySchema,
  reportSlowMovingQuerySchema,
  reportStockMovementQuerySchema,
  reportTaxQuerySchema,
  reportTaxSummaryQuerySchema,
  reportCashFlowQuerySchema,
} from '@tradeflow/shared';
import { getEffectivePermissions } from '../../../shared/middleware/auth';
import { getValidatedQuery } from '../../../shared/middleware/validate';
import { ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import {
  asOfOrDefault,
  dateFromOrDefault,
  dateToOrDefault,
  parseLimitParam,
} from '../services/reports/helpers';
import * as accountingReports from '../services/reports/accountingReports';
import * as inventoryReports from '../services/reports/inventoryReports';
import * as purchasesReports from '../services/reports/purchasesReports';
import * as salesReports from '../services/reports/salesReports';

export async function dailySales(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof reportDailySalesQuerySchema>>(req);
  const result = await salesReports.dailySales({
    dateFrom: dateFromOrDefault(q.dateFrom),
    dateTo: dateToOrDefault(q.dateTo),
    customerId: q.customerId ?? null,
    warehouseId: q.warehouseId ?? null,
  });
  return ok(result);
}

export async function stockMovement(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof reportStockMovementQuerySchema>>(req);
  const result = await inventoryReports.stockMovement({
    dateFrom: dateFromOrDefault(q.dateFrom),
    dateTo: dateToOrDefault(q.dateTo),
    productId: q.productId ?? null,
    warehouseId: q.warehouseId ?? null,
  });
  return ok(result);
}

export async function fastMoving(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof reportFastMovingQuerySchema>>(req);
  const result = await salesReports.fastMoving({
    dateFrom: dateFromOrDefault(q.dateFrom),
    dateTo: dateToOrDefault(q.dateTo),
    limit: parseLimitParam(q.limit),
    sortBy: q.sortBy === 'value' ? 'value' : 'quantity',
  });
  return ok(result);
}

export async function expenseAnalysis(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof reportDateRangeOnlyQuerySchema>>(req);
  const result = await accountingReports.expenseAnalysis({
    dateFrom: dateFromOrDefault(q.dateFrom),
    dateTo: dateToOrDefault(q.dateTo),
  });
  return ok(result);
}

export async function receivablesAging(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof reportReceivablesAgingQuerySchema>>(req);
  const result = await salesReports.receivablesAging({
    asOf: asOfOrDefault(q.asOf),
  });
  return ok(result);
}

export async function payablesAging(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof reportPayablesAgingQuerySchema>>(req);
  const result = await purchasesReports.payablesAging({
    asOf: asOfOrDefault(q.asOf),
  });
  return ok(result);
}

export async function trialBalance(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof reportDateRangeOnlyQuerySchema>>(req);
  const result = await accountingReports.trialBalance({
    dateFrom: dateFromOrDefault(q.dateFrom),
    dateTo: dateToOrDefault(q.dateTo),
  });
  return ok(result);
}

export async function profitLoss(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof reportDateRangeOnlyQuerySchema>>(req);
  const result = await accountingReports.profitLoss({
    dateFrom: dateFromOrDefault(q.dateFrom),
    dateTo: dateToOrDefault(q.dateTo),
  });
  return ok(result);
}

export async function balanceSheet(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof reportBalanceSheetQuerySchema>>(req);
  const result = await accountingReports.balanceSheet({
    asOfDate: asOfOrDefault(q.asOfDate),
  });
  return ok(result);
}

export async function taxCollected(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof reportTaxQuerySchema>>(req);
  const result = await accountingReports.taxCollected({
    dateFrom: dateFromOrDefault(q.dateFrom),
    dateTo: dateToOrDefault(q.dateTo),
    taxProfileId: q.taxProfileId ?? null,
  });
  return ok(result);
}

export async function taxPaid(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof reportTaxQuerySchema>>(req);
  const result = await accountingReports.taxPaid({
    dateFrom: dateFromOrDefault(q.dateFrom),
    dateTo: dateToOrDefault(q.dateTo),
    taxProfileId: q.taxProfileId ?? null,
  });
  return ok(result);
}

export async function taxSummary(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof reportTaxSummaryQuerySchema>>(req);
  const result = await accountingReports.taxSummary({
    dateFrom: dateFromOrDefault(q.dateFrom),
    dateTo: dateToOrDefault(q.dateTo),
    permissions: getEffectivePermissions(req),
  });
  return ok(result);
}

export async function deadStock(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof reportDeadStockQuerySchema>>(req);
  const result = await inventoryReports.deadStock({
    asOf: asOfOrDefault(q.asOf),
    daysWithoutSale: q.daysWithoutSale ?? 90,
  });
  return ok(result);
}

export async function slowMoving(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof reportSlowMovingQuerySchema>>(req);
  const result = await inventoryReports.slowMoving({
    dateFrom: dateFromOrDefault(q.dateFrom),
    dateTo: dateToOrDefault(q.dateTo),
    limit: parseLimitParam(q.limit),
  });
  return ok(result);
}

export async function grnInvoiceReconciliation(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof reportGrnInvoiceReconciliationQuerySchema>>(req);
  const result = await purchasesReports.grnInvoiceReconciliation({
    asOf: asOfOrDefault(q.asOf),
    permissions: getEffectivePermissions(req),
  });
  return ok(result);
}

export async function dashboardKpis(req: Request): Promise<ControllerResult> {
  const result = await purchasesReports.dashboardKpis({
    permissions: getEffectivePermissions(req),
  });
  return ok(result);
}

export async function purchaseVsSales(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof reportPurchaseVsSalesQuerySchema>>(req);
  const result = await purchasesReports.purchaseVsSales({
    dateFrom: dateFromOrDefault(q.dateFrom),
    dateTo: dateToOrDefault(q.dateTo),
    permissions: getEffectivePermissions(req),
  });
  return ok(result);
}

export async function profitByProduct(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof reportProfitByProductQuerySchema>>(req);
  const result = await salesReports.profitByProduct({
    dateFrom: dateFromOrDefault(q.dateFrom),
    dateTo: dateToOrDefault(q.dateTo),
  });
  return ok(result);
}

export async function profitByCustomer(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof reportProfitByCustomerQuerySchema>>(req);
  const result = await salesReports.profitByCustomer({
    dateFrom: dateFromOrDefault(q.dateFrom),
    dateTo: dateToOrDefault(q.dateTo),
  });
  return ok(result);
}

export async function cashFlow(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof reportCashFlowQuerySchema>>(req);
  const result = await accountingReports.cashFlow({
    dateFrom: dateFromOrDefault(q.dateFrom),
    dateTo: dateToOrDefault(q.dateTo),
  });
  return ok(result);
}
