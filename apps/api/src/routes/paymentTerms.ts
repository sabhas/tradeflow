import { Router } from 'express';
import { createPaymentTermsSchema, updatePaymentTermsSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { getValidatedBody, validateBody } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
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
  validateBody(createPaymentTermsSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await paymentTermsController.createPaymentTerms(req, getValidatedBody(req)));
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
  validateBody(updatePaymentTermsSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await paymentTermsController.updatePaymentTerms(req, getValidatedBody(req)));
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
