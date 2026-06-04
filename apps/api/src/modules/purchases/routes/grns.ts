import { Router } from 'express';
import { createGrnSchema, listGrnsQuerySchema, updateGrnSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { handle, handleBody } from '../../../shared/utils/handleRoute';
import * as grnsController from '../controllers/grnsController';

export const grnsRouter = Router();
grnsRouter.use(authMiddleware, loadUser);

grnsRouter.get(
  '/',
  requirePermission('purchases.grn', 'read'),
  validateQuery(listGrnsQuerySchema),
  handle(grnsController.listGrns)
);

grnsRouter.get(
  '/pending-invoice-count',
  requirePermission('purchases.grn', 'read'),
  handle(grnsController.pendingInvoiceCount)
);

grnsRouter.get('/:id', requirePermission('purchases.grn', 'read'), handle(grnsController.getGrn));

grnsRouter.post(
  '/',
  requirePermission('purchases.grn', 'write'),
  auditMiddleware({ entity: 'Grn', getNewValue: (req) => req.body }),
  validateBody(createGrnSchema),
  handleBody(grnsController.createGrn)
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
  handleBody(grnsController.updateGrn)
);

grnsRouter.post(
  '/:id/post',
  requirePermission('purchases.grn', 'post'),
  auditMiddleware({
    entity: 'Grn',
    getEntityId: (req) => req.params.id,
    getNewValue: () => ({ status: 'posted' }),
  }),
  handle(grnsController.postGrn)
);

grnsRouter.post(
  '/:id/create-supplier-invoice-draft',
  requirePermission('purchases.supplier_invoices', 'write'),
  auditMiddleware({
    entity: 'SupplierInvoice',
    getEntityId: (req) => req.params.id,
    getNewValue: () => ({ source: 'grn_draft' }),
  }),
  handle(grnsController.createSupplierInvoiceDraftFromGrn)
);
