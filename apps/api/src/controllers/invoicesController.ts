import type { Request } from 'express';
import { IsNull } from 'typeorm';
import type { z } from 'zod';
import {
  CompanySettings,
  Customer,
  Invoice,
  InvoiceLine,
  InvoiceTemplate,
} from '@tradeflow/db';
import {
  createInvoiceSchema,
  printInvoicesBatchSchema,
  updateInvoiceSchema,
} from '@tradeflow/shared';
import { getPagination } from '../utils/pagination';
import { computeSalesDocumentTotals } from '../services/salesTotals';
import { runInTransaction } from '../services/inventoryService';
import { postInvoice, resolveInvoiceDueDate } from '../services/invoicePosting';
import { getCompanySettingsRow } from '../services/companySettings';
import { resolveInvoiceLineUnitPrices } from '../services/invoicePricingService';
import {
  assertNoOtherInvoiceForSalesOrder,
  assertSalesOrderConfirmedForInvoice,
} from '../services/salesOrderInvoiceGuard';
import {
  buildInvoicePrintHtml,
  buildInvoicesBatchPrintHtml,
  renderInvoiceBody,
  type InvoicePrintData,
} from '../services/invoiceHtml';
import { created, htmlOk, ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

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
        unitPrice: l.unitPrice,
        taxAmount: l.taxAmount,
        discountAmount: l.discountAmount,
        taxProfileId: l.taxProfileId,
      })) ?? undefined,
  };
}

export async function listInvoices(req: Request): Promise<ControllerResult> {
  const { limit, offset } = getPagination(req);
  const qb = Invoice
    .createQueryBuilder('i')
    .leftJoinAndSelect('i.customer', 'customer')
    .where('i.deletedAt IS NULL')
    .orderBy('i.invoiceDate', 'DESC')
    .addOrderBy('i.createdAt', 'DESC')
    .take(limit)
    .skip(offset);
  if (req.query.customerId) qb.andWhere('i.customerId = :cid', { cid: req.query.customerId });
  if (req.query.status) qb.andWhere('i.status = :st', { st: req.query.status });
  if (req.query.documentKind) qb.andWhere('i.documentKind = :dk', { dk: req.query.documentKind });
  if (req.query.dateFrom) qb.andWhere('i.invoiceDate >= :df', { df: req.query.dateFrom });
  if (req.query.dateTo) qb.andWhere('i.invoiceDate <= :dt', { dt: req.query.dateTo });
  const [rows, total] = await qb.getManyAndCount();
  return ok({ data: rows.map((i) => serializeInvoice(i)), meta: { total, limit, offset } });
}

async function loadCompanyForPrint(): Promise<CompanySettings> {
  const company = (
    await CompanySettings.find({
      order: { id: 'ASC' },
      take: 1,
      relations: ['defaultInvoiceTemplate'],
    })
  )[0];
  if (!company) {
    throw new HttpError(500, { error: 'Company settings not initialized' });
  }
  return company;
}

async function loadInvoicePrintData(
  id: string,
  company: CompanySettings
): Promise<InvoicePrintData | null> {
  const inv = await Invoice.findOne({
    where: { id, deletedAt: IsNull() },
    relations: ['lines', 'lines.product', 'customer', 'customer.paymentTerms', 'warehouse', 'invoiceTemplate'],
  });
  if (!inv) return null;
  const cust =
    inv.customer ||
    (await Customer.findOne({
      where: { id: inv.customerId, deletedAt: IsNull() },
      relations: ['paymentTerms'],
    }));
  const name = cust?.name ?? 'Customer';
  let template: InvoiceTemplate | null = inv.invoiceTemplate ?? null;
  if (!template && company.defaultInvoiceTemplateId) {
    template = await InvoiceTemplate.findOne({
      where: { id: company.defaultInvoiceTemplateId },
    });
  }
  const productNames = new Map<string, string>();
  for (const l of inv.lines ?? []) {
    if (l.product?.name) productNames.set(l.productId, l.product.name);
  }
  return {
    invoice: inv,
    lines: inv.lines ?? [],
    customerName: name,
    company,
    template,
    productNames,
    paymentTermsLabel: cust?.paymentTerms?.name ?? null,
  };
}

export async function getInvoicePdfHtml(req: Request): Promise<ControllerResult> {
  const company = await loadCompanyForPrint();
  const data = await loadInvoicePrintData(req.params.id, company);
  if (!data) {
    throw new HttpError(404, { error: 'Not found' });
  }
  return htmlOk(buildInvoicePrintHtml(data));
}

export async function printInvoicesBatch(
  req: Request,
  body: z.infer<typeof printInvoicesBatchSchema>
): Promise<ControllerResult> {
  let ids: string[] = [];
  if (body.mode === 'ids') {
    ids = body.ids;
  } else {
    const limit = Math.min(body.limit ?? 50, 100);
    const qb = Invoice
      .createQueryBuilder('i')
      .select(['i.id'])
      .where('i.deletedAt IS NULL')
      .orderBy('i.invoiceDate', 'DESC')
      .addOrderBy('i.createdAt', 'DESC')
      .take(limit);
    if (body.customerId) qb.andWhere('i.customerId = :cid', { cid: body.customerId });
    if (body.status) qb.andWhere('i.status = :st', { st: body.status });
    if (body.dateFrom) qb.andWhere('i.invoiceDate >= :df', { df: body.dateFrom });
    if (body.dateTo) qb.andWhere('i.invoiceDate <= :dt', { dt: body.dateTo });
    const rows = await qb.getMany();
    ids = rows.map((r) => r.id);
  }
  if (ids.length === 0) {
    throw new HttpError(404, { error: 'No invoices match the given criteria' });
  }
  const company = await loadCompanyForPrint();
  const parts: string[] = [];
  for (const id of ids) {
    const data = await loadInvoicePrintData(id, company);
    if (data) parts.push(renderInvoiceBody(data));
  }
  if (parts.length === 0) {
    throw new HttpError(404, { error: 'No printable invoices found' });
  }
  return htmlOk(buildInvoicesBatchPrintHtml(parts));
}

export async function createInvoice(req: Request, body: CreateInvoiceInput): Promise<ControllerResult> {
  const b = body;
  try {
    const saved = await runInTransaction(async (manager) => {
      const documentKind = b.documentKind ?? 'invoice';
      const due = await resolveInvoiceDueDate(
        manager,
        b.customerId,
        b.invoiceDate.slice(0, 10),
        b.paymentType ?? 'credit',
        b.dueDate ?? null
      );
      const pricedLines = await resolveInvoiceLineUnitPrices(manager, b.warehouseId, b.lines);
      const totals = await computeSalesDocumentTotals(
        manager,
        b.customerId,
        pricedLines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
          taxProfileId: l.taxProfileId,
        })),
        b.discountAmount
      );
      let invoiceTemplateId: string | undefined = b.invoiceTemplateId ?? undefined;
      if (invoiceTemplateId) {
        const t = await manager.findOne(InvoiceTemplate, { where: { id: invoiceTemplateId } });
        if (!t) throw new Error('Invoice template not found');
      } else {
        const cs = await getCompanySettingsRow(manager);
        invoiceTemplateId = cs.defaultInvoiceTemplateId ?? undefined;
      }
      if (documentKind === 'credit_note') {
        if (!b.originalInvoiceId) throw new Error('Credit note requires original invoice');
        const orig = await manager.findOne(Invoice, {
          where: { id: b.originalInvoiceId, deletedAt: IsNull() },
        });
        if (!orig) throw new Error('Original invoice not found');
        if (orig.status !== 'posted') throw new Error('Original invoice must be posted');
        if (orig.customerId !== b.customerId) throw new Error('Customer must match original invoice');
        if (orig.warehouseId !== b.warehouseId) throw new Error('Warehouse must match original invoice');
      }
      const inv = manager.create(Invoice, {
        customerId: b.customerId,
        invoiceDate: b.invoiceDate.slice(0, 10),
        dueDate: due,
        status: 'draft',
        paymentType: b.paymentType ?? 'credit',
        warehouseId: b.warehouseId,
        documentKind,
        originalInvoiceId: documentKind === 'credit_note' ? b.originalInvoiceId ?? undefined : undefined,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discountAmount: totals.discountAmount,
        total: totals.total,
        notes: b.notes ?? undefined,
        salesOrderId: documentKind === 'credit_note' ? undefined : b.salesOrderId ?? undefined,
        salespersonId: b.salespersonId ?? undefined,
        invoiceTemplateId,
        createdBy: req.auth?.userId,
      });
      if (documentKind !== 'credit_note') {
        await assertSalesOrderConfirmedForInvoice(manager, inv.salesOrderId);
        await assertNoOtherInvoiceForSalesOrder(manager, inv.salesOrderId);
      }
      await manager.save(inv);
      for (let i = 0; i < totals.lines.length; i++) {
        const l = totals.lines[i];
        const pl = pricedLines[i];
        await manager.save(
          manager.create(InvoiceLine, {
            invoiceId: inv.id,
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxAmount: l.taxAmount,
            discountAmount: l.discountAmount,
            taxProfileId: l.taxProfileId ?? undefined,
            originalInvoiceLineId: pl.originalInvoiceLineId ?? undefined,
          })
        );
      }
      return manager.findOneOrFail(Invoice, { where: { id: inv.id }, relations: ['lines'] });
    });
    return created({ data: serializeInvoice(saved, saved.lines) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, { error: (e as Error).message });
  }
}

export async function postInvoiceAction(req: Request): Promise<ControllerResult> {
  try {
    const inv = await postInvoice(req.params.id, req.auth?.userId);
    const full = await Invoice.findOne({
      where: { id: inv.id, deletedAt: IsNull() },
      relations: ['lines'],
    });
    return ok({ data: serializeInvoice(full!, full!.lines) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, { error: (e as Error).message });
  }
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

export async function updateInvoice(req: Request, body: UpdateInvoiceInput): Promise<ControllerResult> {
  try {
    const out = await runInTransaction(async (manager) => {
      const inv = await manager.findOne(Invoice, {
        where: { id: req.params.id, deletedAt: IsNull() },
        relations: ['lines'],
      });
      if (!inv) throw new Error('Not found');
      if (inv.status !== 'draft') throw new Error('Only draft invoices can be edited');
      const b = body;
      if (b.customerId !== undefined) inv.customerId = b.customerId;
      if (b.invoiceDate !== undefined) inv.invoiceDate = b.invoiceDate.slice(0, 10);
      if (b.warehouseId !== undefined) inv.warehouseId = b.warehouseId;
      if (b.paymentType !== undefined) inv.paymentType = b.paymentType;
      if (b.notes !== undefined) inv.notes = b.notes ?? undefined;
      if (b.salesOrderId !== undefined && inv.documentKind !== 'credit_note') {
        inv.salesOrderId = b.salesOrderId ?? undefined;
      }
      if (b.salespersonId !== undefined) inv.salespersonId = b.salespersonId ?? undefined;
            if (b.invoiceTemplateId !== undefined) {
        if (b.invoiceTemplateId) {
          const t = await manager.findOne(InvoiceTemplate, { where: { id: b.invoiceTemplateId } });
          if (!t) throw new Error('Invoice template not found');
          inv.invoiceTemplateId = b.invoiceTemplateId;
        } else {
          inv.invoiceTemplateId = undefined;
        }
      }

      if (b.dueDate !== undefined && b.dueDate !== null) {
        inv.dueDate = b.dueDate.slice(0, 10);
      } else if (b.invoiceDate !== undefined || b.paymentType !== undefined) {
        inv.dueDate = await resolveInvoiceDueDate(
          manager,
          inv.customerId,
          inv.invoiceDate,
          inv.paymentType,
          null
        );
      }

      if (b.lines) {
        await manager.delete(InvoiceLine, { invoiceId: inv.id });
        const pricedLines = await resolveInvoiceLineUnitPrices(
          manager,
          b.warehouseId ?? inv.warehouseId,
          b.lines
        );
        const totals = await computeSalesDocumentTotals(
          manager,
          inv.customerId,
          pricedLines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountAmount: l.discountAmount,
            taxProfileId: l.taxProfileId,
          })),
          b.discountAmount !== undefined ? b.discountAmount : inv.discountAmount
        );
        inv.subtotal = totals.subtotal;
        inv.taxAmount = totals.taxAmount;
        inv.discountAmount = totals.discountAmount;
        inv.total = totals.total;
        for (let i = 0; i < totals.lines.length; i++) {
          const l = totals.lines[i];
          const pl = pricedLines[i];
          await manager.save(
            manager.create(InvoiceLine, {
              invoiceId: inv.id,
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              taxAmount: l.taxAmount,
              discountAmount: l.discountAmount,
              taxProfileId: l.taxProfileId ?? undefined,
              originalInvoiceLineId: pl.originalInvoiceLineId ?? undefined,
            })
          );
        }
      } else if (b.discountAmount !== undefined) {
        const lines = (inv.lines || []).map((l) => ({
          productId: l.productId,
          quantity: parseFloat(l.quantity),
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
          taxProfileId: l.taxProfileId,
          originalInvoiceLineId: l.originalInvoiceLineId,
        }));
        const totals = await computeSalesDocumentTotals(manager, inv.customerId, lines, b.discountAmount);
        inv.subtotal = totals.subtotal;
        inv.taxAmount = totals.taxAmount;
        inv.discountAmount = totals.discountAmount;
        inv.total = totals.total;
        await manager.delete(InvoiceLine, { invoiceId: inv.id });
        for (let i = 0; i < totals.lines.length; i++) {
          const l = totals.lines[i];
          const src = lines[i];
          await manager.save(
            manager.create(InvoiceLine, {
              invoiceId: inv.id,
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              taxAmount: l.taxAmount,
              discountAmount: l.discountAmount,
              taxProfileId: l.taxProfileId ?? undefined,
              originalInvoiceLineId: src?.originalInvoiceLineId ?? undefined,
            })
          );
        }
      }
      if (inv.documentKind !== 'credit_note') {
        await assertSalesOrderConfirmedForInvoice(manager, inv.salesOrderId);
        await assertNoOtherInvoiceForSalesOrder(manager, inv.salesOrderId, inv.id);
      }
      await manager.save(inv);
      return manager.findOneOrFail(Invoice, {
        where: { id: inv.id, deletedAt: IsNull() },
        relations: ['lines'],
      });
    });
    return ok({ data: serializeInvoice(out, out.lines) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const msg = (e as Error).message;
    throw new HttpError(msg === 'Not found' ? 404 : 400, { error: msg });
  }
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
