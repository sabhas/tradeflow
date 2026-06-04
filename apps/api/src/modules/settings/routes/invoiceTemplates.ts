import { Router } from 'express';
import {
  createInvoiceTemplateSchema,
  paginationQuerySchema,
  updateInvoiceTemplateSchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { handle, handleBody } from '../../../shared/utils/handleRoute';
import * as invoiceTemplatesController from '../controllers/invoiceTemplatesController';

export const invoiceTemplatesRouter = Router();
invoiceTemplatesRouter.use(authMiddleware, loadUser);

invoiceTemplatesRouter.get(
  '/',
  requirePermission('settings', 'read'),
  validateQuery(paginationQuerySchema),
  handle(invoiceTemplatesController.listInvoiceTemplates)
);

invoiceTemplatesRouter.get(
  '/:id',
  requirePermission('settings', 'read'),
  handle(invoiceTemplatesController.getInvoiceTemplate)
);

invoiceTemplatesRouter.post(
  '/',
  requirePermission('settings', 'write'),
  auditMiddleware({ entity: 'InvoiceTemplate', getNewValue: (req) => req.body }),
  validateBody(createInvoiceTemplateSchema),
  handleBody(invoiceTemplatesController.createInvoiceTemplate)
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
  handleBody(invoiceTemplatesController.updateInvoiceTemplate)
);
