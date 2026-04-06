import { Router } from 'express';
import { createInvoiceTemplateSchema, updateInvoiceTemplateSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../controllers/asyncHandler';
import { sendControllerResult } from '../controllers/controllerResult';
import * as invoiceTemplatesController from '../controllers/invoiceTemplatesController';

export const invoiceTemplatesRouter = Router();
invoiceTemplatesRouter.use(authMiddleware, loadUser);

invoiceTemplatesRouter.get(
  '/',
  requirePermission('settings', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await invoiceTemplatesController.listInvoiceTemplates(req));
  })
);

invoiceTemplatesRouter.get(
  '/:id',
  requirePermission('settings', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await invoiceTemplatesController.getInvoiceTemplate(req));
  })
);

invoiceTemplatesRouter.post(
  '/',
  requirePermission('settings', 'write'),
  auditMiddleware({ entity: 'InvoiceTemplate', getNewValue: (req) => req.body }),
  asyncHandler(async (req, res) => {
    const parsed = createInvoiceTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await invoiceTemplatesController.createInvoiceTemplate(req, parsed.data));
  })
);

invoiceTemplatesRouter.patch(
  '/:id',
  requirePermission('settings', 'write'),
  auditMiddleware({
    entity: 'InvoiceTemplate',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  asyncHandler(async (req, res) => {
    const parsed = updateInvoiceTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await invoiceTemplatesController.updateInvoiceTemplate(req, parsed.data));
  })
);
