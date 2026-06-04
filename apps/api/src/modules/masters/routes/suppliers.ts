import { Router } from 'express';
import {
  createSupplierSchema,
  listSuppliersQuerySchema,
  supplierLedgerQuerySchema,
  supplierStatementQuerySchema,
  updateSupplierSchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as suppliersController from '../controllers/suppliersController';

export const suppliersRouter = Router();
suppliersRouter.use(authMiddleware, loadUser);

suppliersRouter.get(
  '/',
  requirePermission('masters.suppliers', 'read'),
  validateQuery(listSuppliersQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await suppliersController.listSuppliers(req));
  })
);

suppliersRouter.get(
  '/:id/statement',
  requirePermission('purchases.reports', 'read'),
  validateQuery(supplierStatementQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await suppliersController.getSupplierStatement(req));
  })
);

suppliersRouter.get(
  '/:id/pricing-history',
  requirePermission('purchases.reports', 'read'),
  validateQuery(supplierLedgerQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await suppliersController.getSupplierPricingHistory(req));
  })
);

suppliersRouter.get(
  '/:id',
  requirePermission('masters.suppliers', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await suppliersController.getSupplier(req));
  })
);

suppliersRouter.post(
  '/',
  requirePermission('masters.suppliers', 'write'),
  auditMiddleware({ entity: 'Supplier', getNewValue: (req) => req.body }),
  validateBody(createSupplierSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await suppliersController.createSupplier(req, getValidatedBody(req)));
  })
);

suppliersRouter.patch(
  '/:id',
  requirePermission('masters.suppliers', 'write'),
  auditMiddleware({
    entity: 'Supplier',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => suppliersController.getSupplierSnapshotForAudit(req.params.id),
    getNewValue: (req) => req.body,
  }),
  validateBody(updateSupplierSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await suppliersController.updateSupplier(req, getValidatedBody(req)));
  })
);

suppliersRouter.delete(
  '/:id',
  requirePermission('masters.suppliers', 'write'),
  auditMiddleware({
    entity: 'Supplier',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => suppliersController.getSupplierSnapshotForAudit(req.params.id),
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await suppliersController.deleteSupplier(req));
  })
);
