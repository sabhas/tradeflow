import { Router } from 'express';
import { createGrnSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
import * as grnsController from '../controllers/grnsController';

export const grnsRouter = Router();
grnsRouter.use(authMiddleware, loadUser);

grnsRouter.get(
  '/',
  requirePermission('purchases.grn', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await grnsController.listGrns(req));
  })
);

grnsRouter.get(
  '/pending-invoice-count',
  requirePermission('purchases.grn', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await grnsController.pendingInvoiceCount(req));
  })
);

grnsRouter.get(
  '/:id',
  requirePermission('purchases.grn', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await grnsController.getGrn(req));
  })
);

grnsRouter.post(
  '/',
  requirePermission('purchases.grn', 'write'),
  auditMiddleware({ entity: 'Grn', getNewValue: (req) => req.body }),
  asyncHandler(async (req, res) => {
    const parsed = createGrnSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await grnsController.createGrn(req, parsed.data));
  })
);

grnsRouter.post(
  '/:id/post',
  requirePermission('purchases.grn', 'post'),
  auditMiddleware({
    entity: 'Grn',
    getEntityId: (req) => req.params.id,
    getNewValue: () => ({ status: 'posted' }),
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await grnsController.postGrn(req));
  })
);

grnsRouter.post(
  '/:id/create-supplier-invoice-draft',
  requirePermission('purchases.supplier_invoices', 'write'),
  auditMiddleware({
    entity: 'SupplierInvoice',
    getEntityId: (req) => req.params.id,
    getNewValue: () => ({ source: 'grn_draft' }),
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await grnsController.createSupplierInvoiceDraftFromGrn(req));
  })
);
