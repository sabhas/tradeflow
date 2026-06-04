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
import { handle, handleBody } from '../../../shared/utils/handleRoute';
import * as invoicesController from '../controllers/invoicesController';

export const invoicesRouter = Router();
invoicesRouter.use(authMiddleware, loadUser);

invoicesRouter.get(
  '/',
  requirePermission('sales', 'read'),
  validateQuery(listInvoicesQuerySchema),
  handle(invoicesController.listInvoices)
);

invoicesRouter.post(
  '/',
  requirePermission('sales', 'create'),
  auditMiddleware({ entity: 'Invoice', getNewValue: (req) => req.body }),
  validateBody(createInvoiceSchema),
  handleBody(invoicesController.createInvoice)
);

invoicesRouter.post(
  '/print-batch',
  requirePermission('sales', 'read'),
  validateBody(printInvoicesBatchSchema),
  handleBody(invoicesController.printInvoicesBatch)
);

invoicesRouter.get(
  '/:id/pdf',
  requirePermission('sales', 'read'),
  handle(invoicesController.getInvoicePdfHtml)
);

invoicesRouter.post(
  '/:id/post',
  requirePermission('sales', 'post'),
  auditMiddleware({ entity: 'Invoice', getEntityId: (req) => req.params.id }),
  handle(invoicesController.postInvoiceAction)
);

invoicesRouter.get('/:id', requirePermission('sales', 'read'), handle(invoicesController.getInvoice));

invoicesRouter.patch(
  '/:id',
  requirePermission('sales', 'update'),
  auditMiddleware({
    entity: 'Invoice',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  validateBody(updateInvoiceSchema),
  handleBody(invoicesController.updateInvoice)
);

invoicesRouter.delete(
  '/:id',
  requirePermission('sales', 'update'),
  auditMiddleware({
    entity: 'Invoice',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => invoicesController.getInvoiceSnapshotForAudit(req.params.id),
  }),
  handle(invoicesController.deleteInvoice)
);
