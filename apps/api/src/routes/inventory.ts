import { Router } from 'express';
import { postOpeningBalanceSchema, postStockAdjustmentSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
import * as inventoryController from '../controllers/inventoryController';

export const inventoryRouter = Router();
inventoryRouter.use(authMiddleware, loadUser);

inventoryRouter.get(
  '/balances',
  requirePermission('inventory', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await inventoryController.listBalances(req));
  })
);

inventoryRouter.get(
  '/balances/batches',
  requirePermission('inventory', 'read'),
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
  asyncHandler(async (req, res) => {
    const parsed = postOpeningBalanceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await inventoryController.postOpeningBalance(req, parsed.data));
  })
);

inventoryRouter.post(
  '/adjustment',
  requirePermission('inventory', 'write'),
  auditMiddleware({
    entity: 'StockAdjustment',
    getNewValue: (req) => req.body,
  }),
  asyncHandler(async (req, res) => {
    const parsed = postStockAdjustmentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await inventoryController.postStockAdjustment(req, parsed.data));
  })
);
