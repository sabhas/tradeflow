import { Router } from 'express';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { resolveBranchId } from '../utils/branchScope';
import { buildCustomersXlsx, buildInvoicesXlsx, buildProductsXlsx } from '../services/listExportService';

export const exportRouter = Router();
exportRouter.use(authMiddleware, loadUser);

exportRouter.get('/products', requirePermission('masters.products', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const categoryId = (req.query.categoryId as string | undefined) || undefined;
  const search = (req.query.search as string | undefined) || undefined;
  try {
    const buf = await buildProductsXlsx(branchId, categoryId, search);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="products-export.xlsx"');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Export failed' });
  }
});

exportRouter.get('/customers', requirePermission('masters.customers', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const search = (req.query.search as string | undefined) || undefined;
  try {
    const buf = await buildCustomersXlsx(branchId, search);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="customers-export.xlsx"');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Export failed' });
  }
});

exportRouter.get('/invoices', requirePermission('sales', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const customerId = (req.query.customerId as string | undefined) || undefined;
  const status = (req.query.status as string | undefined) || undefined;
  const dateFrom = (req.query.dateFrom as string | undefined)?.slice(0, 10);
  const dateTo = (req.query.dateTo as string | undefined)?.slice(0, 10);
  try {
    const buf = await buildInvoicesXlsx(branchId, { customerId, status, dateFrom, dateTo });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="invoices-export.xlsx"');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Export failed' });
  }
});
