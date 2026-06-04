import { Router } from 'express';
import { createQuotationSchema, listQuotationsQuerySchema, updateQuotationSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as quotationsController from '../controllers/quotationsController';

export const quotationsRouter = Router();
quotationsRouter.use(authMiddleware, loadUser);

quotationsRouter.get(
  '/',
  requirePermission('sales', 'read'),
  validateQuery(listQuotationsQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await quotationsController.listQuotations(req));
  })
);

quotationsRouter.get(
  '/:id',
  requirePermission('sales', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await quotationsController.getQuotation(req));
  })
);

quotationsRouter.post(
  '/',
  requirePermission('sales', 'create'),
  auditMiddleware({ entity: 'Quotation', getNewValue: (req) => req.body }),
  validateBody(createQuotationSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await quotationsController.createQuotation(req, getValidatedBody(req)));
  })
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
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await quotationsController.updateQuotation(req, getValidatedBody(req)));
  })
);

quotationsRouter.delete(
  '/:id',
  requirePermission('sales', 'update'),
  auditMiddleware({ entity: 'Quotation', getEntityId: (req) => req.params.id }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await quotationsController.deleteQuotation(req));
  })
);

quotationsRouter.post(
  '/:id/convert-to-order',
  requirePermission('sales', 'update'),
  auditMiddleware({ entity: 'Quotation', getEntityId: (req) => req.params.id }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await quotationsController.convertQuotationToOrder(req));
  })
);
