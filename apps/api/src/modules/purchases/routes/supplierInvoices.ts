import { Router } from 'express';
import {
  createSupplierInvoiceSchema,
  listOpenSupplierInvoicesQuerySchema,
  listSupplierInvoicesQuerySchema,
  updateSupplierInvoiceSchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { handle, handleBody } from '../../../shared/utils/handleRoute';
import * as supplierInvoicesController from '../controllers/supplierInvoicesController';

export const supplierInvoicesRouter = Router();
supplierInvoicesRouter.use(authMiddleware, loadUser);

supplierInvoicesRouter.get(
  '/',
  requirePermission('purchases.supplier_invoices', 'read'),
  validateQuery(listSupplierInvoicesQuerySchema),
  handle(supplierInvoicesController.listSupplierInvoices)
);

supplierInvoicesRouter.get(
  '/open',
  requirePermission('purchases.supplier_invoices', 'read'),
  validateQuery(listOpenSupplierInvoicesQuerySchema),
  handle(supplierInvoicesController.listOpenSupplierInvoices)
);

supplierInvoicesRouter.get(
  '/:id',
  requirePermission('purchases.supplier_invoices', 'read'),
  handle(supplierInvoicesController.getSupplierInvoice)
);

supplierInvoicesRouter.post(
  '/',
  requirePermission('purchases.supplier_invoices', 'write'),
  auditMiddleware({ entity: 'SupplierInvoice', getNewValue: (req) => req.body }),
  validateBody(createSupplierInvoiceSchema),
  handleBody(supplierInvoicesController.createSupplierInvoice)
);

supplierInvoicesRouter.patch(
  '/:id',
  requirePermission('purchases.supplier_invoices', 'write'),
  auditMiddleware({
    entity: 'SupplierInvoice',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  validateBody(updateSupplierInvoiceSchema),
  handleBody(supplierInvoicesController.updateSupplierInvoice)
);

supplierInvoicesRouter.post(
  '/:id/post',
  requirePermission('purchases.supplier_invoices', 'post'),
  auditMiddleware({
    entity: 'SupplierInvoice',
    getEntityId: (req) => req.params.id,
    getNewValue: () => ({ status: 'posted' }),
  }),
  handle(supplierInvoicesController.postSupplierInvoice)
);

supplierInvoicesRouter.delete(
  '/:id',
  requirePermission('purchases.supplier_invoices', 'write'),
  handle(supplierInvoicesController.deleteSupplierInvoice)
);
