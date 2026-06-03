import { Router } from 'express';
import { createInvoiceTemplateSchema, updateInvoiceTemplateSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
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
  validateBody(createInvoiceTemplateSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(
      res,
      await invoiceTemplatesController.createInvoiceTemplate(req, getValidatedBody(req))
    );
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
  validateBody(updateInvoiceTemplateSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(
      res,
      await invoiceTemplatesController.updateInvoiceTemplate(req, getValidatedBody(req))
    );
  })
);
