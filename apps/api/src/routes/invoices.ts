import { Router } from 'express';
import { createInvoiceSchema, updateInvoiceSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../controllers/asyncHandler';
import { sendControllerResult } from '../controllers/controllerResult';
import * as invoicesController from '../controllers/invoicesController';

export const invoicesRouter = Router();
invoicesRouter.use(authMiddleware, loadUser);

invoicesRouter.get(
  '/',
  requirePermission('sales', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await invoicesController.listInvoices(req));
  })
);

invoicesRouter.post(
  '/',
  requirePermission('sales', 'create'),
  auditMiddleware({ entity: 'Invoice', getNewValue: (req) => req.body }),
  asyncHandler(async (req, res) => {
    const parsed = createInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await invoicesController.createInvoice(req, parsed.data));
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
  asyncHandler(async (req, res) => {
    const parsed = updateInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await invoicesController.updateInvoice(req, parsed.data));
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
