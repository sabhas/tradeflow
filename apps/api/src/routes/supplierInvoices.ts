import { Router } from 'express';
import { createSupplierInvoiceSchema, updateSupplierInvoiceSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { getValidatedBody, validateBody } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
import * as supplierInvoicesController from '../controllers/supplierInvoicesController';

export const supplierInvoicesRouter = Router();
supplierInvoicesRouter.use(authMiddleware, loadUser);

supplierInvoicesRouter.get(
  '/',
  requirePermission('purchases.supplier_invoices', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await supplierInvoicesController.listSupplierInvoices(req));
  })
);

supplierInvoicesRouter.get(
  '/open',
  requirePermission('purchases.supplier_invoices', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await supplierInvoicesController.listOpenSupplierInvoices(req));
  })
);

supplierInvoicesRouter.get(
  '/:id',
  requirePermission('purchases.supplier_invoices', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await supplierInvoicesController.getSupplierInvoice(req));
  })
);

supplierInvoicesRouter.post(
  '/',
  requirePermission('purchases.supplier_invoices', 'write'),
  auditMiddleware({ entity: 'SupplierInvoice', getNewValue: (req) => req.body }),
  validateBody(createSupplierInvoiceSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(
      res,
      await supplierInvoicesController.createSupplierInvoice(req, getValidatedBody(req))
    );
  })
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
  asyncHandler(async (req, res) => {
    sendControllerResult(
      res,
      await supplierInvoicesController.updateSupplierInvoice(req, getValidatedBody(req))
    );
  })
);

supplierInvoicesRouter.post(
  '/:id/post',
  requirePermission('purchases.supplier_invoices', 'post'),
  auditMiddleware({
    entity: 'SupplierInvoice',
    getEntityId: (req) => req.params.id,
    getNewValue: () => ({ status: 'posted' }),
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await supplierInvoicesController.postSupplierInvoice(req));
  })
);

supplierInvoicesRouter.delete(
  '/:id',
  requirePermission('purchases.supplier_invoices', 'write'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await supplierInvoicesController.deleteSupplierInvoice(req));
  })
);
