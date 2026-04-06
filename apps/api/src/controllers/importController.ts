import type { Request } from 'express';
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
import { ok, type ControllerResult } from './controllerResult';
import { HttpError } from './httpError';

export type TemplateFileDownload = {
  data: Buffer | string;
  contentType: string;
  contentDisposition: string;
};

function hasAccountingWrite(req: Request): boolean {
  const perms = req.auth?.permissions ?? [];
  return perms.includes('*') || perms.includes('accounting:write');
}

export async function downloadProductsTemplate(req: Request): Promise<TemplateFileDownload> {
  const fmt = ((req.query.format as string) || 'xlsx').toLowerCase();
  if (fmt === 'csv') {
    return {
      data: '\uFEFF' + productImportTemplateCsv(),
      contentType: 'text/csv; charset=utf-8',
      contentDisposition: 'attachment; filename="products-import-template.csv"',
    };
  }
  const buf = await productImportTemplateBuffer();
  return {
    data: buf,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    contentDisposition: 'attachment; filename="products-import-template.xlsx"',
  };
}

export async function downloadCustomersTemplate(req: Request): Promise<TemplateFileDownload> {
  const fmt = ((req.query.format as string) || 'xlsx').toLowerCase();
  if (fmt === 'csv') {
    return {
      data: '\uFEFF' + customerImportTemplateCsv(),
      contentType: 'text/csv; charset=utf-8',
      contentDisposition: 'attachment; filename="customers-import-template.csv"',
    };
  }
  const buf = await customerImportTemplateBuffer();
  return {
    data: buf,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    contentDisposition: 'attachment; filename="customers-import-template.xlsx"',
  };
}

export async function downloadOpeningBalancesTemplate(req: Request): Promise<TemplateFileDownload> {
  const fmt = ((req.query.format as string) || 'xlsx').toLowerCase();
  if (fmt === 'csv') {
    return {
      data: '\uFEFF' + openingInventoryTemplateCsv(),
      contentType: 'text/csv; charset=utf-8',
      contentDisposition: 'attachment; filename="opening-inventory-template.csv"',
    };
  }
  const buf = await openingBalanceTemplateBuffer();
  return {
    data: buf,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    contentDisposition: 'attachment; filename="opening-balances-template.xlsx"',
  };
}

export async function importProducts(req: Request): Promise<ControllerResult> {
  const file = req.file;
  if (!file?.buffer) {
    throw new HttpError(400, { error: 'file is required (multipart field: file)' });
  }
  try {
    const sheets = await parseUploadToSheets(file.buffer, file.mimetype, file.originalname);
    const branchId = resolveBranchId(req);
    const result = await importProductsFromSheets(sheets, branchId, req.user?.branchId);
    return ok(result);
  } catch (e) {
    throw new HttpError(400, { error: e instanceof Error ? e.message : 'Import failed' });
  }
}

export async function importCustomers(req: Request): Promise<ControllerResult> {
  const file = req.file;
  if (!file?.buffer) {
    throw new HttpError(400, { error: 'file is required (multipart field: file)' });
  }
  try {
    const sheets = await parseUploadToSheets(file.buffer, file.mimetype, file.originalname);
    const branchId = resolveBranchId(req);
    const result = await importCustomersFromSheets(sheets, branchId, req.user?.branchId);
    return ok(result);
  } catch (e) {
    throw new HttpError(400, { error: e instanceof Error ? e.message : 'Import failed' });
  }
}

export async function importOpeningBalances(req: Request): Promise<ControllerResult> {
  const file = req.file;
  if (!file?.buffer) {
    throw new HttpError(400, { error: 'file is required (multipart field: file)' });
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
    return ok(result);
  } catch (e) {
    throw new HttpError(400, { error: e instanceof Error ? e.message : 'Import failed' });
  }
}
