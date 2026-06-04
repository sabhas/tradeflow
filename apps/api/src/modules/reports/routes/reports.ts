import { Router } from 'express';
import {
  reportBalanceSheetQuerySchema,
  reportDailySalesQuerySchema,
  reportDashboardKpisQuerySchema,
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
import {
  authMiddleware,
  loadUser,
  requireAnyPermission,
  requirePermission,
} from '../../../shared/middleware/auth';
import { validateQuery } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as reportsController from '../controllers/reportsController';

export const reportsRouter = Router();
reportsRouter.use(authMiddleware, loadUser);

reportsRouter.get(
  '/daily-sales',
  requirePermission('sales', 'read'),
  validateQuery(reportDailySalesQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.dailySales(req));
  })
);

reportsRouter.get(
  '/stock-movement',
  requirePermission('inventory', 'read'),
  validateQuery(reportStockMovementQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.stockMovement(req));
  })
);

reportsRouter.get(
  '/fast-moving',
  requirePermission('sales', 'read'),
  validateQuery(reportFastMovingQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.fastMoving(req));
  })
);

reportsRouter.get(
  '/expense-analysis',
  requirePermission('accounting', 'read'),
  validateQuery(reportDateRangeOnlyQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.expenseAnalysis(req));
  })
);

reportsRouter.get(
  '/aging',
  requirePermission('sales', 'read'),
  validateQuery(reportReceivablesAgingQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.receivablesAging(req));
  })
);

reportsRouter.get(
  '/receivables-aging',
  requirePermission('sales', 'read'),
  validateQuery(reportReceivablesAgingQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.receivablesAging(req));
  })
);

reportsRouter.get(
  '/payables-aging',
  requirePermission('purchases.reports', 'read'),
  validateQuery(reportPayablesAgingQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.payablesAging(req));
  })
);

reportsRouter.get(
  '/trial-balance',
  requirePermission('accounting', 'read'),
  validateQuery(reportDateRangeOnlyQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.trialBalance(req));
  })
);

reportsRouter.get(
  '/profit-loss',
  requirePermission('accounting', 'read'),
  validateQuery(reportDateRangeOnlyQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.profitLoss(req));
  })
);

reportsRouter.get(
  '/balance-sheet',
  requirePermission('accounting', 'read'),
  validateQuery(reportBalanceSheetQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.balanceSheet(req));
  })
);

reportsRouter.get(
  '/tax-collected',
  requirePermission('sales', 'read'),
  validateQuery(reportTaxQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.taxCollected(req));
  })
);

reportsRouter.get(
  '/tax-paid',
  requirePermission('purchases.reports', 'read'),
  validateQuery(reportTaxQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.taxPaid(req));
  })
);

reportsRouter.get(
  '/tax-summary',
  requireAnyPermission('sales:read', 'purchases.reports:read'),
  validateQuery(reportTaxSummaryQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.taxSummary(req));
  })
);

reportsRouter.get(
  '/dead-stock',
  requirePermission('inventory', 'read'),
  validateQuery(reportDeadStockQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.deadStock(req));
  })
);

reportsRouter.get(
  '/slow-moving',
  requirePermission('sales', 'read'),
  validateQuery(reportSlowMovingQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.slowMoving(req));
  })
);

reportsRouter.get(
  '/grn-invoice-reconciliation',
  requireAnyPermission('purchases.reports:read', 'purchases.grn:read'),
  validateQuery(reportGrnInvoiceReconciliationQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.grnInvoiceReconciliation(req));
  })
);

reportsRouter.get(
  '/dashboard/kpis',
  requireAnyPermission('sales:read', 'purchases.reports:read', 'purchases.grn:read'),
  validateQuery(reportDashboardKpisQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.dashboardKpis(req));
  })
);

reportsRouter.get(
  '/purchase-vs-sales',
  requirePermission('sales', 'read'),
  validateQuery(reportPurchaseVsSalesQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.purchaseVsSales(req));
  })
);

reportsRouter.get(
  '/profit-by-product',
  requirePermission('sales', 'read'),
  validateQuery(reportProfitByProductQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.profitByProduct(req));
  })
);

reportsRouter.get(
  '/profit-by-customer',
  requirePermission('sales', 'read'),
  validateQuery(reportProfitByCustomerQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.profitByCustomer(req));
  })
);

reportsRouter.get(
  '/cash-flow',
  requirePermission('accounting', 'read'),
  validateQuery(reportCashFlowQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.cashFlow(req));
  })
);
