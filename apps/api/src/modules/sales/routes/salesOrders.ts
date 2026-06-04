import { Router } from 'express';
import {
  bulkSalesOrdersSchema,
  createSalesOrderSchema,
  convertOrderToInvoiceSchema,
  listSalesOrdersQuerySchema,
  updateSalesOrderSchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { handle, handleBody } from '../../../shared/utils/handleRoute';
import * as salesOrdersController from '../controllers/salesOrdersController';

export const salesOrdersRouter = Router();
salesOrdersRouter.use(authMiddleware, loadUser);

salesOrdersRouter.get(
  '/',
  requirePermission('sales', 'read'),
  validateQuery(listSalesOrdersQuerySchema),
  handle(salesOrdersController.listSalesOrders)
);

salesOrdersRouter.get(
  '/:id',
  requirePermission('sales', 'read'),
  handle(salesOrdersController.getSalesOrder)
);

salesOrdersRouter.post(
  '/',
  requirePermission('sales', 'create'),
  auditMiddleware({ entity: 'SalesOrder', getNewValue: (req) => req.body }),
  validateBody(createSalesOrderSchema),
  handleBody(salesOrdersController.createSalesOrder)
);

salesOrdersRouter.post(
  '/bulk',
  requirePermission('sales', 'update'),
  auditMiddleware({ entity: 'SalesOrder', getNewValue: (req) => req.body }),
  validateBody(bulkSalesOrdersSchema),
  handleBody(salesOrdersController.bulkSalesOrders)
);

salesOrdersRouter.patch(
  '/:id',
  requirePermission('sales', 'update'),
  auditMiddleware({
    entity: 'SalesOrder',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  validateBody(updateSalesOrderSchema),
  handleBody(salesOrdersController.updateSalesOrder)
);

salesOrdersRouter.post(
  '/:id/confirm',
  requirePermission('sales', 'update'),
  auditMiddleware({ entity: 'SalesOrder', getEntityId: (req) => req.params.id }),
  handle(salesOrdersController.confirmSalesOrder)
);

salesOrdersRouter.delete(
  '/:id',
  requirePermission('sales', 'update'),
  auditMiddleware({ entity: 'SalesOrder', getEntityId: (req) => req.params.id }),
  handle(salesOrdersController.deleteSalesOrder)
);

salesOrdersRouter.post(
  '/:id/convert-to-invoice',
  requirePermission('sales', 'update'),
  auditMiddleware({ entity: 'SalesOrder', getEntityId: (req) => req.params.id }),
  validateBody(convertOrderToInvoiceSchema),
  handleBody(salesOrdersController.convertSalesOrderToInvoice)
);
