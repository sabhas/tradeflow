import express, { Router } from 'express';
import { IsNull } from 'typeorm';
import { dataSource, CompanySettings, Customer, Invoice, InvoiceLine, InvoiceTemplate } from '@tradeflow/db';
import { createInvoiceSchema, updateInvoiceSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';
import { computeSalesDocumentTotals } from '../services/salesTotals';
import { runInTransaction } from '../services/inventoryService';
import { postInvoice, resolveInvoiceDueDate } from '../services/invoicePosting';
import { getCompanySettingsRow } from '../services/companySettings';
import { buildInvoicePrintHtml } from '../services/invoiceHtml';

export const invoicesRouter = Router();
invoicesRouter.use(authMiddleware, loadUser);

async function pdfHandler(req: express.Request, res: express.Response) {
  const inv = await dataSource.getRepository(Invoice).findOne({
    where: { id: req.params.id, deletedAt: IsNull() },
    relations: ['lines', 'lines.product', 'customer', 'customer.paymentTerms', 'warehouse', 'invoiceTemplate'],
  });
  if (!inv) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const cust =
    inv.customer ||
    (await dataSource.getRepository(Customer).findOne({
      where: { id: inv.customerId, deletedAt: IsNull() },
      relations: ['paymentTerms'],
    }));
  const name = cust?.name ?? 'Customer';
  const company = await dataSource.getRepository(CompanySettings).findOne({
    order: { id: 'ASC' },
    relations: ['defaultInvoiceTemplate'],
  });
  if (!company) {
    res.status(500).json({ error: 'Company settings not initialized' });
    return;
  }
  let template: InvoiceTemplate | null = inv.invoiceTemplate ?? null;
  if (!template && company.defaultInvoiceTemplateId) {
    template = await dataSource.getRepository(InvoiceTemplate).findOne({
      where: { id: company.defaultInvoiceTemplateId },
    });
  }
  const productNames = new Map<string, string>();
  for (const l of inv.lines ?? []) {
    if (l.product?.name) productNames.set(l.productId, l.product.name);
  }
  const html = buildInvoicePrintHtml({
    invoice: inv,
    lines: inv.lines ?? [],
    customerName: name,
    company,
    template,
    productNames,
    paymentTermsLabel: cust?.paymentTerms?.name ?? null,
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

function serialize(inv: Invoice, lines?: InvoiceLine[]) {
  return {
    id: inv.id,
    customerId: inv.customerId,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    status: inv.status,
    paymentType: inv.paymentType,
    warehouseId: inv.warehouseId,
    salesOrderId: inv.salesOrderId,
    salespersonId: inv.salespersonId,
    subtotal: inv.subtotal,
    taxAmount: inv.taxAmount,
    discountAmount: inv.discountAmount,
    total: inv.total,
    notes: inv.notes,
    branchId: inv.branchId,
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
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxAmount: l.taxAmount,
        discountAmount: l.discountAmount,
        taxProfileId: l.taxProfileId,
      })) ?? undefined,
  };
}

invoicesRouter.get('/', requirePermission('sales', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const { limit, offset } = getPagination(req);
  const qb = dataSource
    .getRepository(Invoice)
    .createQueryBuilder('i')
    .where('i.deleted_at IS NULL')
    .orderBy('i.invoice_date', 'DESC')
    .take(limit)
    .skip(offset);
  if (branchId) qb.andWhere('(i.branch_id IS NULL OR i.branch_id = :bid)', { bid: branchId });
  if (req.query.customerId) qb.andWhere('i.customer_id = :cid', { cid: req.query.customerId });
  if (req.query.status) qb.andWhere('i.status = :st', { st: req.query.status });
  if (req.query.dateFrom) qb.andWhere('i.invoice_date >= :df', { df: req.query.dateFrom });
  if (req.query.dateTo) qb.andWhere('i.invoice_date <= :dt', { dt: req.query.dateTo });
  const [rows, total] = await qb.getManyAndCount();
  res.json({ data: rows.map((i) => serialize(i)), meta: { total, limit, offset } });
});

invoicesRouter.post(
  '/',
  requirePermission('sales', 'create'),
  auditMiddleware({ entity: 'Invoice', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    try {
      const saved = await runInTransaction(async (manager) => {
        const due = await resolveInvoiceDueDate(
          manager,
          b.customerId,
          b.invoiceDate.slice(0, 10),
          b.paymentType ?? 'credit',
          b.dueDate ?? null
        );
        const totals = await computeSalesDocumentTotals(
          manager,
          b.customerId,
          b.lines.map((l) => ({
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
        const inv = manager.create(Invoice, {
          customerId: b.customerId,
          invoiceDate: b.invoiceDate.slice(0, 10),
          dueDate: due,
          status: 'draft',
          paymentType: b.paymentType ?? 'credit',
          warehouseId: b.warehouseId,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          discountAmount: totals.discountAmount,
          total: totals.total,
          notes: b.notes ?? undefined,
          salesOrderId: b.salesOrderId ?? undefined,
          salespersonId: b.salespersonId ?? undefined,
          invoiceTemplateId,
          branchId: b.branchId ?? req.user?.branchId ?? undefined,
          createdBy: req.auth?.userId,
        });
        await manager.save(inv);
        for (const l of totals.lines) {
          await manager.save(
            manager.create(InvoiceLine, {
              invoiceId: inv.id,
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              taxAmount: l.taxAmount,
              discountAmount: l.discountAmount,
              taxProfileId: l.taxProfileId ?? undefined,
            })
          );
        }
        return manager.findOneOrFail(Invoice, { where: { id: inv.id }, relations: ['lines'] });
      });
      res.status(201).json({ data: serialize(saved, saved.lines) });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);

invoicesRouter.get('/:id/pdf', requirePermission('sales', 'read'), pdfHandler);

invoicesRouter.post(
  '/:id/post',
  requirePermission('sales', 'post'),
  auditMiddleware({ entity: 'Invoice', getEntityId: (req) => req.params.id }),
  async (req, res) => {
    const branchId = resolveBranchId(req);
    try {
      const inv = await postInvoice(req.params.id, req.auth?.userId, branchId);
      const full = await dataSource.getRepository(Invoice).findOne({
        where: { id: inv.id, deletedAt: IsNull() },
        relations: ['lines'],
      });
      res.json({ data: serialize(full!, full!.lines) });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);

invoicesRouter.get('/:id', requirePermission('sales', 'read'), async (req, res) => {
  const row = await dataSource.getRepository(Invoice).findOne({
    where: { id: req.params.id, deletedAt: IsNull() },
    relations: ['lines', 'lines.product', 'customer', 'warehouse'],
  });
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ data: serialize(row, row.lines) });
});

invoicesRouter.patch(
  '/:id',
  requirePermission('sales', 'update'),
  auditMiddleware({
    entity: 'Invoice',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = updateInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    try {
      const out = await runInTransaction(async (manager) => {
        const inv = await manager.findOne(Invoice, {
          where: { id: req.params.id, deletedAt: IsNull() },
          relations: ['lines'],
        });
        if (!inv) throw new Error('Not found');
        if (inv.status !== 'draft') throw new Error('Only draft invoices can be edited');
        const b = parsed.data;
        if (b.customerId !== undefined) inv.customerId = b.customerId;
        if (b.invoiceDate !== undefined) inv.invoiceDate = b.invoiceDate.slice(0, 10);
        if (b.warehouseId !== undefined) inv.warehouseId = b.warehouseId;
        if (b.paymentType !== undefined) inv.paymentType = b.paymentType;
        if (b.notes !== undefined) inv.notes = b.notes ?? undefined;
        if (b.salesOrderId !== undefined) inv.salesOrderId = b.salesOrderId ?? undefined;
        if (b.salespersonId !== undefined) inv.salespersonId = b.salespersonId ?? undefined;
        if (b.branchId !== undefined) inv.branchId = b.branchId ?? undefined;
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
          const totals = await computeSalesDocumentTotals(
            manager,
            inv.customerId,
            b.lines.map((l) => ({
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
          for (const l of totals.lines) {
            await manager.save(
              manager.create(InvoiceLine, {
                invoiceId: inv.id,
                productId: l.productId,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                taxAmount: l.taxAmount,
                discountAmount: l.discountAmount,
                taxProfileId: l.taxProfileId ?? undefined,
              })
            );
          }
        } else if (b.discountAmount !== undefined) {
          const lines = (inv.lines || []).map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountAmount: l.discountAmount,
            taxProfileId: l.taxProfileId,
          }));
          const totals = await computeSalesDocumentTotals(manager, inv.customerId, lines, b.discountAmount);
          inv.subtotal = totals.subtotal;
          inv.taxAmount = totals.taxAmount;
          inv.discountAmount = totals.discountAmount;
          inv.total = totals.total;
          await manager.delete(InvoiceLine, { invoiceId: inv.id });
          for (const l of totals.lines) {
            await manager.save(
              manager.create(InvoiceLine, {
                invoiceId: inv.id,
                productId: l.productId,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                taxAmount: l.taxAmount,
                discountAmount: l.discountAmount,
                taxProfileId: l.taxProfileId ?? undefined,
              })
            );
          }
        }
        await manager.save(inv);
        return manager.findOneOrFail(Invoice, {
          where: { id: inv.id, deletedAt: IsNull() },
          relations: ['lines'],
        });
      });
      res.json({ data: serialize(out, out.lines) });
    } catch (e) {
      const msg = (e as Error).message;
      res.status(msg === 'Not found' ? 404 : 400).json({ error: msg });
    }
  }
);

invoicesRouter.delete(
  '/:id',
  requirePermission('sales', 'update'),
  auditMiddleware({
    entity: 'Invoice',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => {
      const row = await dataSource.getRepository(Invoice).findOne({
        where: { id: req.params.id, deletedAt: IsNull() },
        relations: ['lines'],
      });
      return row ? serialize(row, row.lines) : undefined;
    },
  }),
  async (req, res) => {
    const inv = await dataSource.getRepository(Invoice).findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    });
    if (!inv) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (inv.status !== 'draft') {
      res.status(400).json({ error: 'Only draft invoices can be deleted' });
      return;
    }
    inv.deletedAt = new Date();
    await dataSource.getRepository(Invoice).save(inv);
    res.json({ data: { id: inv.id, deleted: true } });
  }
);
