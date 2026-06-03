import { Router } from 'express';
import { createSupplierPaymentSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { getValidatedBody, validateBody } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
import * as supplierPaymentsController from '../controllers/supplierPaymentsController';

export const supplierPaymentsRouter = Router();
supplierPaymentsRouter.use(authMiddleware, loadUser);

supplierPaymentsRouter.get(
  '/',
  requirePermission('purchases.payments', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await supplierPaymentsController.listSupplierPayments(req));
  })
);

supplierPaymentsRouter.get(
  '/:id',
  requirePermission('purchases.payments', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await supplierPaymentsController.getSupplierPayment(req));
  })
);

supplierPaymentsRouter.post(
  '/',
  requirePermission('purchases.payments', 'write'),
  auditMiddleware({ entity: 'SupplierPayment', getNewValue: (req) => req.body }),
  validateBody(createSupplierPaymentSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(
      res,
      await supplierPaymentsController.createSupplierPayment(req, getValidatedBody(req))
    );
  })
);
