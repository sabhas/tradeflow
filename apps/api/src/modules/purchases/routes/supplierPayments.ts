import { Router } from 'express';
import { createSupplierPaymentSchema, listSupplierPaymentsQuerySchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as supplierPaymentsController from '../controllers/supplierPaymentsController';

export const supplierPaymentsRouter = Router();
supplierPaymentsRouter.use(authMiddleware, loadUser);

supplierPaymentsRouter.get(
  '/',
  requirePermission('purchases.payments', 'read'),
  validateQuery(listSupplierPaymentsQuerySchema),
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
