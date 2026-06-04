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
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as salesOrdersController from '../controllers/salesOrdersController';

export const salesOrdersRouter = Router();
salesOrdersRouter.use(authMiddleware, loadUser);

salesOrdersRouter.get(
  '/',
  requirePermission('sales', 'read'),
  validateQuery(listSalesOrdersQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await salesOrdersController.listSalesOrders(req));
  })
);

salesOrdersRouter.get(
  '/:id',
  requirePermission('sales', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await salesOrdersController.getSalesOrder(req));
  })
);

salesOrdersRouter.post(
  '/',
  requirePermission('sales', 'create'),
  auditMiddleware({ entity: 'SalesOrder', getNewValue: (req) => req.body }),
  validateBody(createSalesOrderSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await salesOrdersController.createSalesOrder(req, getValidatedBody(req)));
  })
);

salesOrdersRouter.post(
  '/bulk',
  requirePermission('sales', 'update'),
  auditMiddleware({ entity: 'SalesOrder', getNewValue: (req) => req.body }),
  validateBody(bulkSalesOrdersSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await salesOrdersController.bulkSalesOrders(req, getValidatedBody(req)));
  })
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
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await salesOrdersController.updateSalesOrder(req, getValidatedBody(req)));
  })
);

salesOrdersRouter.post(
  '/:id/confirm',
  requirePermission('sales', 'update'),
  auditMiddleware({ entity: 'SalesOrder', getEntityId: (req) => req.params.id }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await salesOrdersController.confirmSalesOrder(req));
  })
);

salesOrdersRouter.delete(
  '/:id',
  requirePermission('sales', 'update'),
  auditMiddleware({ entity: 'SalesOrder', getEntityId: (req) => req.params.id }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await salesOrdersController.deleteSalesOrder(req));
  })
);

salesOrdersRouter.post(
  '/:id/convert-to-invoice',
  requirePermission('sales', 'update'),
  auditMiddleware({ entity: 'SalesOrder', getEntityId: (req) => req.params.id }),
  validateBody(convertOrderToInvoiceSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(
      res,
      await salesOrdersController.convertSalesOrderToInvoice(req, getValidatedBody(req))
    );
  })
);
