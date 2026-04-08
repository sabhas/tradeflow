import { Router } from 'express';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { requireTaxSummaryAccess } from '../middleware/reportsAccess';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
import * as reportsController from '../controllers/reportsController';

export const reportsRouter = Router();
reportsRouter.use(authMiddleware, loadUser);

reportsRouter.get(
  '/daily-sales',
  requirePermission('sales', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.dailySales(req));
  })
);

reportsRouter.get(
  '/stock-movement',
  requirePermission('inventory', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.stockMovement(req));
  })
);

reportsRouter.get(
  '/fast-moving',
  requirePermission('sales', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.fastMoving(req));
  })
);

reportsRouter.get(
  '/expense-analysis',
  requirePermission('accounting', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.expenseAnalysis(req));
  })
);

reportsRouter.get(
  '/aging',
  requirePermission('sales', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.receivablesAging(req));
  })
);

reportsRouter.get(
  '/receivables-aging',
  requirePermission('sales', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.receivablesAging(req));
  })
);

reportsRouter.get(
  '/payables-aging',
  requirePermission('purchases.reports', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.payablesAging(req));
  })
);

reportsRouter.get(
  '/trial-balance',
  requirePermission('accounting', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.trialBalance(req));
  })
);

reportsRouter.get(
  '/profit-loss',
  requirePermission('accounting', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.profitLoss(req));
  })
);

reportsRouter.get(
  '/balance-sheet',
  requirePermission('accounting', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.balanceSheet(req));
  })
);

reportsRouter.get(
  '/tax-collected',
  requirePermission('sales', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.taxCollected(req));
  })
);

reportsRouter.get(
  '/tax-paid',
  requirePermission('purchases.reports', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.taxPaid(req));
  })
);

reportsRouter.get(
  '/tax-summary',
  requireTaxSummaryAccess,
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.taxSummary(req));
  })
);

reportsRouter.get(
  '/dead-stock',
  requirePermission('inventory', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.deadStock(req));
  })
);

reportsRouter.get(
  '/slow-moving',
  requirePermission('sales', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.slowMoving(req));
  })
);

reportsRouter.get(
  '/dashboard/kpis',
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.dashboardKpis(req));
  })
);

reportsRouter.get(
  '/purchase-vs-sales',
  requirePermission('sales', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.purchaseVsSales(req));
  })
);

reportsRouter.get(
  '/profit-by-product',
  requirePermission('sales', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.profitByProduct(req));
  })
);

reportsRouter.get(
  '/profit-by-customer',
  requirePermission('sales', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.profitByCustomer(req));
  })
);

reportsRouter.get(
  '/cash-flow',
  requirePermission('accounting', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await reportsController.cashFlow(req));
  })
);
