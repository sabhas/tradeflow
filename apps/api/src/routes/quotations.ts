import { Router } from 'express';
import { createQuotationSchema, updateQuotationSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
import * as quotationsController from '../controllers/quotationsController';

export const quotationsRouter = Router();
quotationsRouter.use(authMiddleware, loadUser);

quotationsRouter.get(
  '/',
  requirePermission('sales', 'read'),
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
  asyncHandler(async (req, res) => {
    const parsed = createQuotationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await quotationsController.createQuotation(req, parsed.data));
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
  asyncHandler(async (req, res) => {
    const parsed = updateQuotationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await quotationsController.updateQuotation(req, parsed.data));
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
