import type { Request } from 'express';
import { getEffectivePermissions } from '../../../shared/middleware/auth';
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

function optionalUuid(value: unknown): string | null {
  return (value as string | undefined)?.trim() || null;
}

function parseDaysWithoutSale(value: unknown): number {
  const rawDays = parseInt(String(value ?? '90'), 10);
  return Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 3650) : 90;
}

export async function dailySales(req: Request): Promise<ControllerResult> {
  const result = await salesReports.dailySales({
    dateFrom: dateFromOrDefault(req.query.dateFrom),
    dateTo: dateToOrDefault(req.query.dateTo),
    customerId: optionalUuid(req.query.customerId),
    warehouseId: optionalUuid(req.query.warehouseId),
  });
  return ok(result);
}

export async function stockMovement(req: Request): Promise<ControllerResult> {
  const result = await inventoryReports.stockMovement({
    dateFrom: dateFromOrDefault(req.query.dateFrom),
    dateTo: dateToOrDefault(req.query.dateTo),
    productId: optionalUuid(req.query.productId),
    warehouseId: optionalUuid(req.query.warehouseId),
  });
  return ok(result);
}

export async function fastMoving(req: Request): Promise<ControllerResult> {
  const result = await salesReports.fastMoving({
    dateFrom: dateFromOrDefault(req.query.dateFrom),
    dateTo: dateToOrDefault(req.query.dateTo),
    limit: parseLimitParam(req.query.limit),
    sortBy: (req.query.sortBy as string) === 'value' ? 'value' : 'quantity',
  });
  return ok(result);
}

export async function expenseAnalysis(req: Request): Promise<ControllerResult> {
  const result = await accountingReports.expenseAnalysis({
    dateFrom: dateFromOrDefault(req.query.dateFrom),
    dateTo: dateToOrDefault(req.query.dateTo),
  });
  return ok(result);
}

export async function receivablesAging(req: Request): Promise<ControllerResult> {
  const result = await salesReports.receivablesAging({
    asOf: asOfOrDefault(req.query.asOf),
  });
  return ok(result);
}

export async function payablesAging(req: Request): Promise<ControllerResult> {
  const result = await purchasesReports.payablesAging({
    asOf: asOfOrDefault(req.query.asOf),
  });
  return ok(result);
}

export async function trialBalance(req: Request): Promise<ControllerResult> {
  const result = await accountingReports.trialBalance({
    dateFrom: dateFromOrDefault(req.query.dateFrom),
    dateTo: dateToOrDefault(req.query.dateTo),
  });
  return ok(result);
}

export async function profitLoss(req: Request): Promise<ControllerResult> {
  const result = await accountingReports.profitLoss({
    dateFrom: dateFromOrDefault(req.query.dateFrom),
    dateTo: dateToOrDefault(req.query.dateTo),
  });
  return ok(result);
}

export async function balanceSheet(req: Request): Promise<ControllerResult> {
  const result = await accountingReports.balanceSheet({
    asOfDate: asOfOrDefault(req.query.asOfDate),
  });
  return ok(result);
}

export async function taxCollected(req: Request): Promise<ControllerResult> {
  const result = await accountingReports.taxCollected({
    dateFrom: dateFromOrDefault(req.query.dateFrom),
    dateTo: dateToOrDefault(req.query.dateTo),
    taxProfileId: optionalUuid(req.query.taxProfileId),
  });
  return ok(result);
}

export async function taxPaid(req: Request): Promise<ControllerResult> {
  const result = await accountingReports.taxPaid({
    dateFrom: dateFromOrDefault(req.query.dateFrom),
    dateTo: dateToOrDefault(req.query.dateTo),
    taxProfileId: optionalUuid(req.query.taxProfileId),
  });
  return ok(result);
}

export async function taxSummary(req: Request): Promise<ControllerResult> {
  const result = await accountingReports.taxSummary({
    dateFrom: dateFromOrDefault(req.query.dateFrom),
    dateTo: dateToOrDefault(req.query.dateTo),
    permissions: getEffectivePermissions(req),
  });
  return ok(result);
}

export async function deadStock(req: Request): Promise<ControllerResult> {
  const result = await inventoryReports.deadStock({
    asOf: asOfOrDefault(req.query.asOf),
    daysWithoutSale: parseDaysWithoutSale(req.query.daysWithoutSale),
  });
  return ok(result);
}

export async function slowMoving(req: Request): Promise<ControllerResult> {
  const result = await inventoryReports.slowMoving({
    dateFrom: dateFromOrDefault(req.query.dateFrom),
    dateTo: dateToOrDefault(req.query.dateTo),
    limit: parseLimitParam(req.query.limit),
  });
  return ok(result);
}

export async function grnInvoiceReconciliation(req: Request): Promise<ControllerResult> {
  const result = await purchasesReports.grnInvoiceReconciliation({
    asOf: asOfOrDefault(req.query.asOf),
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
  const result = await purchasesReports.purchaseVsSales({
    dateFrom: dateFromOrDefault(req.query.dateFrom),
    dateTo: dateToOrDefault(req.query.dateTo),
    permissions: getEffectivePermissions(req),
  });
  return ok(result);
}

export async function profitByProduct(req: Request): Promise<ControllerResult> {
  const result = await salesReports.profitByProduct({
    dateFrom: dateFromOrDefault(req.query.dateFrom),
    dateTo: dateToOrDefault(req.query.dateTo),
  });
  return ok(result);
}

export async function profitByCustomer(req: Request): Promise<ControllerResult> {
  const result = await salesReports.profitByCustomer({
    dateFrom: dateFromOrDefault(req.query.dateFrom),
    dateTo: dateToOrDefault(req.query.dateTo),
  });
  return ok(result);
}

export async function cashFlow(req: Request): Promise<ControllerResult> {
  const result = await accountingReports.cashFlow({
    dateFrom: dateFromOrDefault(req.query.dateFrom),
    dateTo: dateToOrDefault(req.query.dateTo),
  });
  return ok(result);
}
