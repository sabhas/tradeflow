import { Router } from 'express';
import {
  createInvoiceSchema,
  listInvoicesQuerySchema,
  printInvoicesBatchSchema,
  updateInvoiceSchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as invoicesController from '../controllers/invoicesController';

export const invoicesRouter = Router();
invoicesRouter.use(authMiddleware, loadUser);

invoicesRouter.get(
  '/',
  requirePermission('sales', 'read'),
  validateQuery(listInvoicesQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await invoicesController.listInvoices(req));
  })
);

invoicesRouter.post(
  '/',
  requirePermission('sales', 'create'),
  auditMiddleware({ entity: 'Invoice', getNewValue: (req) => req.body }),
  validateBody(createInvoiceSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await invoicesController.createInvoice(req, getValidatedBody(req)));
  })
);

invoicesRouter.post(
  '/print-batch',
  requirePermission('sales', 'read'),
  validateBody(printInvoicesBatchSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await invoicesController.printInvoicesBatch(req, getValidatedBody(req)));
  })
);

invoicesRouter.get(
  '/:id/pdf',
  requirePermission('sales', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await invoicesController.getInvoicePdfHtml(req));
  })
);

invoicesRouter.post(
  '/:id/post',
  requirePermission('sales', 'post'),
  auditMiddleware({ entity: 'Invoice', getEntityId: (req) => req.params.id }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await invoicesController.postInvoiceAction(req));
  })
);

invoicesRouter.get(
  '/:id',
  requirePermission('sales', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await invoicesController.getInvoice(req));
  })
);

invoicesRouter.patch(
  '/:id',
  requirePermission('sales', 'update'),
  auditMiddleware({
    entity: 'Invoice',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  validateBody(updateInvoiceSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await invoicesController.updateInvoice(req, getValidatedBody(req)));
  })
);

invoicesRouter.delete(
  '/:id',
  requirePermission('sales', 'update'),
  auditMiddleware({
    entity: 'Invoice',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => invoicesController.getInvoiceSnapshotForAudit(req.params.id),
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await invoicesController.deleteInvoice(req));
  })
);
