import type { Request } from 'express';
import type { z } from 'zod';
import {
  exportCustomersQuerySchema,
  exportInvoicesQuerySchema,
  exportProductsQuerySchema,
} from '@tradeflow/shared';
import { getValidatedQuery } from '../../../shared/middleware/validate';
import { buildCustomersXlsx, buildInvoicesXlsx, buildProductsXlsx } from '../services/listExportService';

export async function exportProducts(req: Request): Promise<Buffer> {
  const q = getValidatedQuery<z.infer<typeof exportProductsQuerySchema>>(req);
  return buildProductsXlsx(undefined, q.categoryId, q.search);
}

export async function exportCustomers(req: Request): Promise<Buffer> {
  const q = getValidatedQuery<z.infer<typeof exportCustomersQuerySchema>>(req);
  return buildCustomersXlsx(undefined, q.search);
}

export async function exportInvoices(req: Request): Promise<Buffer> {
  const q = getValidatedQuery<z.infer<typeof exportInvoicesQuerySchema>>(req);
  return buildInvoicesXlsx(undefined, {
    customerId: q.customerId,
    status: q.status,
    dateFrom: q.dateFrom?.slice(0, 10),
    dateTo: q.dateTo?.slice(0, 10),
  });
}
