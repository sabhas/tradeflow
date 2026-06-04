import { Router } from 'express';
import {
  listInventoryMovementsQuerySchema,
  listStockLayersQuerySchema,
  listStockSummaryQuerySchema,
  postOpeningBalanceSchema,
  postStockAdjustmentSchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as inventoryController from '../controllers/inventoryController';

export const inventoryRouter = Router();
inventoryRouter.use(authMiddleware, loadUser);

inventoryRouter.get(
  '/balances',
  requirePermission('inventory', 'read'),
  validateQuery(listStockSummaryQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await inventoryController.listBalances(req));
  })
);

inventoryRouter.get(
  '/balances/batches',
  requirePermission('inventory', 'read'),
  validateQuery(listStockLayersQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await inventoryController.listBatchBalances(req));
  })
);

inventoryRouter.get(
  '/balances/low-stock',
  requirePermission('inventory', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await inventoryController.listLowStock(req));
  })
);

inventoryRouter.get(
  '/movements',
  requirePermission('inventory', 'read'),
  validateQuery(listInventoryMovementsQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await inventoryController.listMovements(req));
  })
);

inventoryRouter.post(
  '/opening-balance',
  requirePermission('inventory', 'write'),
  auditMiddleware({
    entity: 'InventoryOpeningBalance',
    getNewValue: (req) => req.body,
  }),
  validateBody(postOpeningBalanceSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await inventoryController.postOpeningBalance(req, getValidatedBody(req)));
  })
);

inventoryRouter.post(
  '/adjustment',
  requirePermission('inventory', 'write'),
  auditMiddleware({
    entity: 'StockAdjustment',
    getNewValue: (req) => req.body,
  }),
  validateBody(postStockAdjustmentSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await inventoryController.postStockAdjustment(req, getValidatedBody(req)));
  })
);
