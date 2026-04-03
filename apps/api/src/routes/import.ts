import { Request, Router } from 'express';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { importUpload } from '../middleware/upload';
import { resolveBranchId } from '../utils/branchScope';
import { parseUploadToSheets } from '../utils/tabularFile';
import {
  customerImportTemplateBuffer,
  customerImportTemplateCsv,
  openingBalanceTemplateBuffer,
  openingInventoryTemplateCsv,
  productImportTemplateBuffer,
  productImportTemplateCsv,
} from '../utils/templateWorkbooks';
import {
  importCustomersFromSheets,
  importOpeningBalancesFromSheets,
  importProductsFromSheets,
} from '../services/importRunners';

export const importRouter = Router();
importRouter.use(authMiddleware, loadUser);

function hasAccountingWrite(req: Request): boolean {
  const perms = req.auth?.permissions ?? [];
  return perms.includes('*') || perms.includes('accounting:write');
}

importRouter.get(
  '/products/template',
  requirePermission('masters.products', 'write'),
  async (req, res) => {
    const fmt = ((req.query.format as string) || 'xlsx').toLowerCase();
    if (fmt === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="products-import-template.csv"');
      res.send('\uFEFF' + productImportTemplateCsv());
      return;
    }
    const buf = await productImportTemplateBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="products-import-template.xlsx"');
    res.send(buf);
  }
);

importRouter.get(
  '/customers/template',
  requirePermission('masters.customers', 'write'),
  async (req, res) => {
    const fmt = ((req.query.format as string) || 'xlsx').toLowerCase();
    if (fmt === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="customers-import-template.csv"');
      res.send('\uFEFF' + customerImportTemplateCsv());
      return;
    }
    const buf = await customerImportTemplateBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="customers-import-template.xlsx"');
    res.send(buf);
  }
);

importRouter.get(
  '/opening-balances/template',
  requirePermission('inventory', 'write'),
  async (req, res) => {
    const fmt = ((req.query.format as string) || 'xlsx').toLowerCase();
    if (fmt === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="opening-inventory-template.csv"');
      res.send('\uFEFF' + openingInventoryTemplateCsv());
      return;
    }
    const buf = await openingBalanceTemplateBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="opening-balances-template.xlsx"');
    res.send(buf);
  }
);

importRouter.post(
  '/products',
  requirePermission('masters.products', 'write'),
  importUpload.single('file'),
  async (req, res) => {
    const file = req.file;
    if (!file?.buffer) {
      res.status(400).json({ error: 'file is required (multipart field: file)' });
      return;
    }
    try {
      const sheets = await parseUploadToSheets(file.buffer, file.mimetype, file.originalname);
      const branchId = resolveBranchId(req);
      const result = await importProductsFromSheets(sheets, branchId, req.user?.branchId);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Import failed' });
    }
  }
);

importRouter.post(
  '/customers',
  requirePermission('masters.customers', 'write'),
  importUpload.single('file'),
  async (req, res) => {
    const file = req.file;
    if (!file?.buffer) {
      res.status(400).json({ error: 'file is required (multipart field: file)' });
      return;
    }
    try {
      const sheets = await parseUploadToSheets(file.buffer, file.mimetype, file.originalname);
      const branchId = resolveBranchId(req);
      const result = await importCustomersFromSheets(sheets, branchId, req.user?.branchId);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Import failed' });
    }
  }
);

importRouter.post(
  '/opening-balances',
  requirePermission('inventory', 'write'),
  importUpload.single('file'),
  async (req, res) => {
    const file = req.file;
    if (!file?.buffer) {
      res.status(400).json({ error: 'file is required (multipart field: file)' });
      return;
    }
    try {
      const sheets = await parseUploadToSheets(file.buffer, file.mimetype, file.originalname);
      const branchId = resolveBranchId(req);
      const result = await importOpeningBalancesFromSheets(
        sheets,
        branchId,
        req.user?.branchId,
        req.auth?.userId,
        hasAccountingWrite(req)
      );
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Import failed' });
    }
  }
);
