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
import { validateBody, validateQuery } from '../../../shared/middleware/validate';
import { handle, handleBody } from '../../../shared/utils/handleRoute';
import * as suppliersController from '../controllers/suppliersController';

export const suppliersRouter = Router();
suppliersRouter.use(authMiddleware, loadUser);

suppliersRouter.get(
  '/',
  requirePermission('masters.suppliers', 'read'),
  validateQuery(listSuppliersQuerySchema),
  handle(suppliersController.listSuppliers)
);

suppliersRouter.get(
  '/:id/statement',
  requirePermission('purchases.reports', 'read'),
  validateQuery(supplierStatementQuerySchema),
  handle(suppliersController.getSupplierStatement)
);

suppliersRouter.get(
  '/:id/pricing-history',
  requirePermission('purchases.reports', 'read'),
  validateQuery(supplierLedgerQuerySchema),
  handle(suppliersController.getSupplierPricingHistory)
);

suppliersRouter.get(
  '/:id',
  requirePermission('masters.suppliers', 'read'),
  handle(suppliersController.getSupplier)
);

suppliersRouter.post(
  '/',
  requirePermission('masters.suppliers', 'write'),
  auditMiddleware({ entity: 'Supplier', getNewValue: (req) => req.body }),
  validateBody(createSupplierSchema),
  handleBody(suppliersController.createSupplier)
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
  handleBody(suppliersController.updateSupplier)
);

suppliersRouter.delete(
  '/:id',
  requirePermission('masters.suppliers', 'write'),
  auditMiddleware({
    entity: 'Supplier',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => suppliersController.getSupplierSnapshotForAudit(req.params.id),
  }),
  handle(suppliersController.deleteSupplier)
);
