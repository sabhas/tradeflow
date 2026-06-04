import { Router } from 'express';
import { createReceiptSchema, listReceiptsQuerySchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { handle, handleBody } from '../../../shared/utils/handleRoute';
import * as receiptsController from '../controllers/receiptsController';

export const receiptsRouter = Router();
receiptsRouter.use(authMiddleware, loadUser);

receiptsRouter.get(
  '/',
  requirePermission('sales', 'read'),
  validateQuery(listReceiptsQuerySchema),
  handle(receiptsController.listReceipts)
);

receiptsRouter.get('/:id', requirePermission('sales', 'read'), handle(receiptsController.getReceipt));

receiptsRouter.post(
  '/',
  requirePermission('sales', 'post'),
  auditMiddleware({ entity: 'Receipt', getNewValue: (req) => req.body }),
  validateBody(createReceiptSchema),
  handleBody(receiptsController.createReceipt)
);
