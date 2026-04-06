import { Router } from 'express';
import { createWarehouseSchema, updateWarehouseSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../controllers/asyncHandler';
import { sendControllerResult } from '../controllers/controllerResult';
import * as warehousesController from '../controllers/warehousesController';

export const warehousesRouter = Router();
warehousesRouter.use(authMiddleware, loadUser);

warehousesRouter.get(
  '/',
  requirePermission('masters.warehouses', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await warehousesController.listWarehouses(req));
  })
);

warehousesRouter.get(
  '/:id',
  requirePermission('masters.warehouses', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await warehousesController.getWarehouse(req));
  })
);

warehousesRouter.post(
  '/',
  requirePermission('masters.warehouses', 'write'),
  auditMiddleware({ entity: 'Warehouse', getNewValue: (req) => req.body }),
  asyncHandler(async (req, res) => {
    const parsed = createWarehouseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await warehousesController.createWarehouse(req, parsed.data));
  })
);

warehousesRouter.patch(
  '/:id',
  requirePermission('masters.warehouses', 'write'),
  auditMiddleware({
    entity: 'Warehouse',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => warehousesController.getWarehouseSnapshotForAudit(req.params.id),
    getNewValue: (req) => req.body,
  }),
  asyncHandler(async (req, res) => {
    const parsed = updateWarehouseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await warehousesController.updateWarehouse(req, parsed.data));
  })
);
