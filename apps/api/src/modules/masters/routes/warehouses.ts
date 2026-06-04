import { Router } from 'express';
import { paginationQuerySchema, createWarehouseSchema, updateWarehouseSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as warehousesController from '../controllers/warehousesController';

export const warehousesRouter = Router();
warehousesRouter.use(authMiddleware, loadUser);

warehousesRouter.get(
  '/',
  requirePermission('masters.warehouses', 'read'),
  validateQuery(paginationQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await warehousesController.listWarehouses(req));
  })
);

warehousesRouter.get(
  '/:id',
  requirePermission('masters.warehouses', 'read'),
  validateQuery(paginationQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await warehousesController.getWarehouse(req));
  })
);

warehousesRouter.post(
  '/',
  requirePermission('masters.warehouses', 'write'),
  auditMiddleware({ entity: 'Warehouse', getNewValue: (req) => req.body }),
  validateBody(createWarehouseSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await warehousesController.createWarehouse(req, getValidatedBody(req)));
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
  validateBody(updateWarehouseSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await warehousesController.updateWarehouse(req, getValidatedBody(req)));
  })
);
