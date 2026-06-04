import { Router } from 'express';
import { createSupplierPaymentSchema, listSupplierPaymentsQuerySchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { handle, handleBody } from '../../../shared/utils/handleRoute';
import * as supplierPaymentsController from '../controllers/supplierPaymentsController';

export const supplierPaymentsRouter = Router();
supplierPaymentsRouter.use(authMiddleware, loadUser);

supplierPaymentsRouter.get(
  '/',
  requirePermission('purchases.payments', 'read'),
  validateQuery(listSupplierPaymentsQuerySchema),
  handle(supplierPaymentsController.listSupplierPayments)
);

supplierPaymentsRouter.get(
  '/:id',
  requirePermission('purchases.payments', 'read'),
  handle(supplierPaymentsController.getSupplierPayment)
);

supplierPaymentsRouter.post(
  '/',
  requirePermission('purchases.payments', 'write'),
  auditMiddleware({ entity: 'SupplierPayment', getNewValue: (req) => req.body }),
  validateBody(createSupplierPaymentSchema),
  handleBody(supplierPaymentsController.createSupplierPayment)
);
