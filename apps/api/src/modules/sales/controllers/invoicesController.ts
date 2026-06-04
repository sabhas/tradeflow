import type { Request } from 'express';
import { IsNull } from 'typeorm';
import type { z } from 'zod';
import { Invoice, type InvoiceLine } from '@tradeflow/db';
import { listInvoicesQuerySchema, printInvoicesBatchSchema } from '@tradeflow/shared';
import { getValidatedQuery } from '../../../shared/middleware/validate';
import { getPaginationFromQuery } from '../../../shared/utils/pagination';
import { postInvoice } from '../services/invoicePosting';
import { buildInvoicePrintHtml } from '../services/invoiceHtml';
import * as invoiceService from '../services/invoiceService';
import { created, htmlOk, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { toIsoDateString } from '../../../shared/utils/date';
import { HttpError } from '../../../shared/utils/httpError';

export function serializeInvoice(inv: Invoice, lines?: InvoiceLine[]) {
  return {
    id: inv.id,
    customerId: inv.customerId,
    customerName: inv.customer?.name ?? null,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    status: inv.status,
    paymentType: inv.paymentType,
    documentKind: inv.documentKind ?? 'invoice',
    originalInvoiceId: inv.originalInvoiceId ?? null,
    warehouseId: inv.warehouseId,
    salesOrderId: inv.salesOrderId,
    salespersonId: inv.salespersonId,
    subtotal: inv.subtotal,
    taxAmount: inv.taxAmount,
    discountAmount: inv.discountAmount,
    total: inv.total,
    notes: inv.notes,
    invoiceTemplateId: inv.invoiceTemplateId ?? null,
    createdBy: inv.createdBy,
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
    deletedAt: inv.deletedAt ?? null,
    lines:
      lines?.map((l) => ({
        id: l.id,
        productId: l.productId,
        salesOrderLineId: l.salesOrderLineId,
        originalInvoiceLineId: l.originalInvoiceLineId ?? null,
        quantity: l.quantity,
        bonusQuantity: l.bonusQuantity ?? '0',
        unitPrice: l.unitPrice,
        taxAmount: l.taxAmount,
        discountAmount: l.discountAmount,
        taxProfileId: l.taxProfileId,
        batchCode: l.batchCode ?? null,
        expiryDate: toIsoDateString(l.expiryDate) ?? null,
      })) ?? undefined,
  };
}

type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

export async function listInvoices(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<ListInvoicesQuery>(req);
  const { limit, offset } = getPaginationFromQuery(q);
  const qb = Invoice.createQueryBuilder('i')
    .leftJoinAndSelect('i.customer', 'customer')
    .where('i.deletedAt IS NULL')
    .orderBy('i.invoiceDate', 'DESC')
    .addOrderBy('i.createdAt', 'DESC')
    .take(limit)
    .skip(offset);
  if (q.customerId) qb.andWhere('i.customerId = :cid', { cid: q.customerId });
  if (q.status) qb.andWhere('i.status = :st', { st: q.status });
  if (q.documentKind) qb.andWhere('i.documentKind = :dk', { dk: q.documentKind });
  if (q.dateFrom) qb.andWhere('i.invoiceDate >= :df', { df: q.dateFrom });
  if (q.dateTo) qb.andWhere('i.invoiceDate <= :dt', { dt: q.dateTo });
  const [rows, total] = await qb.getManyAndCount();
  return ok({ data: rows.map((i) => serializeInvoice(i)), meta: { total, limit, offset } });
}

export async function getInvoicePdfHtml(req: Request): Promise<ControllerResult> {
  const company = await invoiceService.loadCompanyForPrint();
  const data = await invoiceService.loadInvoicePrintData(req.params.id, company);
  if (!data) {
    throw new HttpError(404, { error: 'Not found' });
  }
  return htmlOk(buildInvoicePrintHtml(data));
}

export async function printInvoicesBatch(
  req: Request,
  body: z.infer<typeof printInvoicesBatchSchema>
): Promise<ControllerResult> {
  const html = await invoiceService.printInvoicesBatch(body);
  return htmlOk(html);
}

export async function createInvoice(
  req: Request,
  body: Parameters<typeof invoiceService.createInvoice>[0]
): Promise<ControllerResult> {
  const saved = await invoiceService.createInvoice(body, req.auth?.userId);
  return created({ data: serializeInvoice(saved, saved.lines) });
}

export async function postInvoiceAction(req: Request): Promise<ControllerResult> {
  const inv = await postInvoice(req.params.id, req.auth?.userId);
  const full = await Invoice.findOne({
    where: { id: inv.id, deletedAt: IsNull() },
    relations: ['lines'],
  });
  return ok({ data: serializeInvoice(full!, full!.lines) });
}

export async function getInvoice(req: Request): Promise<ControllerResult> {
  const row = await Invoice.findOne({
    where: { id: req.params.id, deletedAt: IsNull() },
    relations: ['lines', 'lines.product', 'customer', 'warehouse'],
  });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  return ok({ data: serializeInvoice(row, row.lines) });
}

export async function updateInvoice(
  req: Request,
  body: Parameters<typeof invoiceService.updateInvoice>[1]
): Promise<ControllerResult> {
  const out = await invoiceService.updateInvoice(req.params.id, body);
  return ok({ data: serializeInvoice(out, out.lines) });
}

export async function deleteInvoice(req: Request): Promise<ControllerResult> {
  const inv = await Invoice.findOne({
    where: { id: req.params.id, deletedAt: IsNull() },
  });
  if (!inv) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (inv.status !== 'draft') {
    throw new HttpError(400, { error: 'Only draft invoices can be deleted' });
  }
  inv.deletedAt = new Date();
  await Invoice.save(inv);
  return ok({ data: { id: inv.id, deleted: true } });
}

export async function getInvoiceSnapshotForAudit(id: string) {
  const row = await Invoice.findOne({
    where: { id, deletedAt: IsNull() },
    relations: ['lines'],
  });
  return row ? serializeInvoice(row, row.lines) : undefined;
}
