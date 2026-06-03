import type { Request } from 'express';
import { buildCustomersXlsx, buildInvoicesXlsx, buildProductsXlsx } from '../services/listExportService';

export async function exportProducts(req: Request): Promise<Buffer> {
  const categoryId = (req.query.categoryId as string | undefined) || undefined;
  const search = (req.query.search as string | undefined) || undefined;
  return buildProductsXlsx(undefined, categoryId, search);
}

export async function exportCustomers(req: Request): Promise<Buffer> {
  const search = (req.query.search as string | undefined) || undefined;
  return buildCustomersXlsx(undefined, search);
}

export async function exportInvoices(req: Request): Promise<Buffer> {
  const customerId = (req.query.customerId as string | undefined) || undefined;
  const status = (req.query.status as string | undefined) || undefined;
  const dateFrom = (req.query.dateFrom as string | undefined)?.slice(0, 10);
  const dateTo = (req.query.dateTo as string | undefined)?.slice(0, 10);
  return buildInvoicesXlsx(undefined, { customerId, status, dateFrom, dateTo });
}
