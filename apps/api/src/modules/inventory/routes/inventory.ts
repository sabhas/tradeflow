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
import { handle, handleBody } from '../../../shared/utils/handleRoute';
import * as inventoryController from '../controllers/inventoryController';

export const inventoryRouter = Router();
inventoryRouter.use(authMiddleware, loadUser);

inventoryRouter.get(
  '/balances',
  requirePermission('inventory', 'read'),
  validateQuery(listStockSummaryQuerySchema),
  handle(inventoryController.listBalances)
);

inventoryRouter.get(
  '/balances/batches',
  requirePermission('inventory', 'read'),
  validateQuery(listStockLayersQuerySchema),
  handle(inventoryController.listBatchBalances)
);

inventoryRouter.get(
  '/balances/low-stock',
  requirePermission('inventory', 'read'),
  handle(inventoryController.listLowStock)
);

inventoryRouter.get(
  '/movements',
  requirePermission('inventory', 'read'),
  validateQuery(listInventoryMovementsQuerySchema),
  handle(inventoryController.listMovements)
);

inventoryRouter.post(
  '/opening-balance',
  requirePermission('inventory', 'write'),
  auditMiddleware({
    entity: 'InventoryOpeningBalance',
    getNewValue: (req) => req.body,
  }),
  validateBody(postOpeningBalanceSchema),
  handleBody(inventoryController.postOpeningBalance)
);

inventoryRouter.post(
  '/adjustment',
  requirePermission('inventory', 'write'),
  auditMiddleware({
    entity: 'StockAdjustment',
    getNewValue: (req) => req.body,
  }),
  validateBody(postStockAdjustmentSchema),
  handleBody(inventoryController.postStockAdjustment)
);
