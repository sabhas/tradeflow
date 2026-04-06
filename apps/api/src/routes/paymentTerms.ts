import { Router } from 'express';
import { createPaymentTermsSchema, updatePaymentTermsSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../controllers/asyncHandler';
import { sendControllerResult } from '../controllers/controllerResult';
import * as paymentTermsController from '../controllers/paymentTermsController';

export const paymentTermsRouter = Router();
paymentTermsRouter.use(authMiddleware, loadUser);

paymentTermsRouter.get(
  '/',
  requirePermission('masters.payment_terms', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await paymentTermsController.listPaymentTerms(req));
  })
);

paymentTermsRouter.post(
  '/',
  requirePermission('masters.payment_terms', 'write'),
  auditMiddleware({ entity: 'PaymentTerms', getNewValue: (req) => req.body }),
  asyncHandler(async (req, res) => {
    const parsed = createPaymentTermsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await paymentTermsController.createPaymentTerms(req, parsed.data));
  })
);

paymentTermsRouter.patch(
  '/:id',
  requirePermission('masters.payment_terms', 'write'),
  auditMiddleware({
    entity: 'PaymentTerms',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => paymentTermsController.getPaymentTermsSnapshotForAudit(req.params.id),
    getNewValue: (req) => req.body,
  }),
  asyncHandler(async (req, res) => {
    const parsed = updatePaymentTermsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await paymentTermsController.updatePaymentTerms(req, parsed.data));
  })
);

paymentTermsRouter.delete(
  '/:id',
  requirePermission('masters.payment_terms', 'write'),
  auditMiddleware({
    entity: 'PaymentTerms',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => paymentTermsController.getPaymentTermsSnapshotForAudit(req.params.id),
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await paymentTermsController.deletePaymentTerms(req));
  })
);
