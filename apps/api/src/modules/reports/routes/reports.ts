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
import { handle } from '../../../shared/utils/handleRoute';
import * as reportsController from '../controllers/reportsController';

export const reportsRouter = Router();
reportsRouter.use(authMiddleware, loadUser);

reportsRouter.get(
  '/daily-sales',
  requirePermission('sales', 'read'),
  validateQuery(reportDailySalesQuerySchema),
  handle(reportsController.dailySales)
);

reportsRouter.get(
  '/stock-movement',
  requirePermission('inventory', 'read'),
  validateQuery(reportStockMovementQuerySchema),
  handle(reportsController.stockMovement)
);

reportsRouter.get(
  '/fast-moving',
  requirePermission('sales', 'read'),
  validateQuery(reportFastMovingQuerySchema),
  handle(reportsController.fastMoving)
);

reportsRouter.get(
  '/expense-analysis',
  requirePermission('accounting', 'read'),
  validateQuery(reportDateRangeOnlyQuerySchema),
  handle(reportsController.expenseAnalysis)
);

reportsRouter.get(
  '/aging',
  requirePermission('sales', 'read'),
  validateQuery(reportReceivablesAgingQuerySchema),
  handle(reportsController.receivablesAging)
);

reportsRouter.get(
  '/receivables-aging',
  requirePermission('sales', 'read'),
  validateQuery(reportReceivablesAgingQuerySchema),
  handle(reportsController.receivablesAging)
);

reportsRouter.get(
  '/payables-aging',
  requirePermission('purchases.reports', 'read'),
  validateQuery(reportPayablesAgingQuerySchema),
  handle(reportsController.payablesAging)
);

reportsRouter.get(
  '/trial-balance',
  requirePermission('accounting', 'read'),
  validateQuery(reportDateRangeOnlyQuerySchema),
  handle(reportsController.trialBalance)
);

reportsRouter.get(
  '/profit-loss',
  requirePermission('accounting', 'read'),
  validateQuery(reportDateRangeOnlyQuerySchema),
  handle(reportsController.profitLoss)
);

reportsRouter.get(
  '/balance-sheet',
  requirePermission('accounting', 'read'),
  validateQuery(reportBalanceSheetQuerySchema),
  handle(reportsController.balanceSheet)
);

reportsRouter.get(
  '/tax-collected',
  requirePermission('sales', 'read'),
  validateQuery(reportTaxQuerySchema),
  handle(reportsController.taxCollected)
);

reportsRouter.get(
  '/tax-paid',
  requirePermission('purchases.reports', 'read'),
  validateQuery(reportTaxQuerySchema),
  handle(reportsController.taxPaid)
);

reportsRouter.get(
  '/tax-summary',
  requireAnyPermission('sales:read', 'purchases.reports:read'),
  validateQuery(reportTaxSummaryQuerySchema),
  handle(reportsController.taxSummary)
);

reportsRouter.get(
  '/dead-stock',
  requirePermission('inventory', 'read'),
  validateQuery(reportDeadStockQuerySchema),
  handle(reportsController.deadStock)
);

reportsRouter.get(
  '/slow-moving',
  requirePermission('sales', 'read'),
  validateQuery(reportSlowMovingQuerySchema),
  handle(reportsController.slowMoving)
);

reportsRouter.get(
  '/grn-invoice-reconciliation',
  requireAnyPermission('purchases.reports:read', 'purchases.grn:read'),
  validateQuery(reportGrnInvoiceReconciliationQuerySchema),
  handle(reportsController.grnInvoiceReconciliation)
);

reportsRouter.get(
  '/dashboard/kpis',
  requireAnyPermission('sales:read', 'purchases.reports:read', 'purchases.grn:read'),
  validateQuery(reportDashboardKpisQuerySchema),
  handle(reportsController.dashboardKpis)
);

reportsRouter.get(
  '/purchase-vs-sales',
  requirePermission('sales', 'read'),
  validateQuery(reportPurchaseVsSalesQuerySchema),
  handle(reportsController.purchaseVsSales)
);

reportsRouter.get(
  '/profit-by-product',
  requirePermission('sales', 'read'),
  validateQuery(reportProfitByProductQuerySchema),
  handle(reportsController.profitByProduct)
);

reportsRouter.get(
  '/profit-by-customer',
  requirePermission('sales', 'read'),
  validateQuery(reportProfitByCustomerQuerySchema),
  handle(reportsController.profitByCustomer)
);

reportsRouter.get(
  '/cash-flow',
  requirePermission('accounting', 'read'),
  validateQuery(reportCashFlowQuerySchema),
  handle(reportsController.cashFlow)
);
