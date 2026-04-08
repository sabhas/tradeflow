// @ts-nocheck
import type { Request } from 'express';
import { buildCustomersXlsx, buildInvoicesXlsx, buildProductsXlsx } from '../services/listExportService';
import { HttpError } from '../utils/httpError';

export async function exportProducts(req: Request): Promise<Buffer> {
  const branchId = undefined;
  const categoryId = (req.query.categoryId as string | undefined) || undefined;
  const search = (req.query.search as string | undefined) || undefined;
  try {
    return await buildProductsXlsx(branchId, categoryId, search);
  } catch (e) {
    throw new HttpError(500, { error: e instanceof Error ? e.message : 'Export failed' });
  }
}

export async function exportCustomers(req: Request): Promise<Buffer> {
  const branchId = undefined;
  const search = (req.query.search as string | undefined) || undefined;
  try {
    return await buildCustomersXlsx(branchId, search);
  } catch (e) {
    throw new HttpError(500, { error: e instanceof Error ? e.message : 'Export failed' });
  }
}

export async function exportInvoices(req: Request): Promise<Buffer> {
  const branchId = undefined;
  const customerId = (req.query.customerId as string | undefined) || undefined;
  const status = (req.query.status as string | undefined) || undefined;
  const dateFrom = (req.query.dateFrom as string | undefined)?.slice(0, 10);
  const dateTo = (req.query.dateTo as string | undefined)?.slice(0, 10);
  try {
    return await buildInvoicesXlsx(branchId, { customerId, status, dateFrom, dateTo });
  } catch (e) {
    throw new HttpError(500, { error: e instanceof Error ? e.message : 'Export failed' });
  }
}
