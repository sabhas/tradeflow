import { Router } from 'express';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../controllers/asyncHandler';
import * as exportController from '../controllers/exportController';

export const exportRouter = Router();
exportRouter.use(authMiddleware, loadUser);

exportRouter.get(
  '/products',
  requirePermission('masters.products', 'read'),
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
  asyncHandler(async (req, res) => {
    const buf = await exportController.exportInvoices(req);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="invoices-export.xlsx"');
    res.send(buf);
  })
);
