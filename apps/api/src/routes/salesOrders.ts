import { Router } from 'express';
import {
  createSalesOrderSchema,
  convertOrderToInvoiceSchema,
  updateSalesOrderSchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../controllers/asyncHandler';
import { sendControllerResult } from '../controllers/controllerResult';
import * as salesOrdersController from '../controllers/salesOrdersController';

export const salesOrdersRouter = Router();
salesOrdersRouter.use(authMiddleware, loadUser);

salesOrdersRouter.get(
  '/',
  requirePermission('sales', 'read'),
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
  asyncHandler(async (req, res) => {
    const parsed = createSalesOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await salesOrdersController.createSalesOrder(req, parsed.data));
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
  asyncHandler(async (req, res) => {
    const parsed = updateSalesOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await salesOrdersController.updateSalesOrder(req, parsed.data));
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
  asyncHandler(async (req, res) => {
    const parsed = convertOrderToInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await salesOrdersController.convertSalesOrderToInvoice(req, parsed.data));
  })
);
