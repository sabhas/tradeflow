import { Router } from 'express';
import { createGrnSchema, updateGrnSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
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
  validateBody(createGrnSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await grnsController.createGrn(req, getValidatedBody(req)));
  })
);

grnsRouter.patch(
  '/:id',
  requirePermission('purchases.grn', 'write'),
  auditMiddleware({
    entity: 'Grn',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  validateBody(updateGrnSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await grnsController.updateGrn(req, getValidatedBody(req)));
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
