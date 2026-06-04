import { Router } from 'express';
import {
  exportCustomersQuerySchema,
  exportInvoicesQuerySchema,
  exportProductsQuerySchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { validateQuery } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import * as exportController from '../controllers/exportController';

export const exportRouter = Router();
exportRouter.use(authMiddleware, loadUser);

exportRouter.get(
  '/products',
  requirePermission('masters.products', 'read'),
  validateQuery(exportProductsQuerySchema),
  asyncHandler(async (req, res) => {
    const buf = await exportController.exportProducts(req);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="products-export.xlsx"');
    res.send(buf);
  })
);

exportRouter.get(
  '/customers',
  requirePermission('masters.customers', 'read'),
  validateQuery(exportCustomersQuerySchema),
  asyncHandler(async (req, res) => {
    const buf = await exportController.exportCustomers(req);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="customers-export.xlsx"');
    res.send(buf);
  })
);

exportRouter.get(
  '/invoices',
  requirePermission('sales', 'read'),
  validateQuery(exportInvoicesQuerySchema),
  asyncHandler(async (req, res) => {
    const buf = await exportController.exportInvoices(req);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="invoices-export.xlsx"');
    res.send(buf);
  })
);
