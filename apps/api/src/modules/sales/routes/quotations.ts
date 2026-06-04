import { Router } from 'express';
import { createQuotationSchema, listQuotationsQuerySchema, updateQuotationSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { handle, handleBody } from '../../../shared/utils/handleRoute';
import * as quotationsController from '../controllers/quotationsController';

export const quotationsRouter = Router();
quotationsRouter.use(authMiddleware, loadUser);

quotationsRouter.get(
  '/',
  requirePermission('sales', 'read'),
  validateQuery(listQuotationsQuerySchema),
  handle(quotationsController.listQuotations)
);

quotationsRouter.get('/:id', requirePermission('sales', 'read'), handle(quotationsController.getQuotation));

quotationsRouter.post(
  '/',
  requirePermission('sales', 'create'),
  auditMiddleware({ entity: 'Quotation', getNewValue: (req) => req.body }),
  validateBody(createQuotationSchema),
  handleBody(quotationsController.createQuotation)
);

quotationsRouter.patch(
  '/:id',
  requirePermission('sales', 'update'),
  auditMiddleware({
    entity: 'Quotation',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  validateBody(updateQuotationSchema),
  handleBody(quotationsController.updateQuotation)
);

quotationsRouter.delete(
  '/:id',
  requirePermission('sales', 'update'),
  auditMiddleware({ entity: 'Quotation', getEntityId: (req) => req.params.id }),
  handle(quotationsController.deleteQuotation)
);

quotationsRouter.post(
  '/:id/convert-to-order',
  requirePermission('sales', 'update'),
  auditMiddleware({ entity: 'Quotation', getEntityId: (req) => req.params.id }),
  handle(quotationsController.convertQuotationToOrder)
);
