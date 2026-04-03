import express, { Router } from 'express';
import { IsNull } from 'typeorm';
import { dataSource, Customer, Invoice, InvoiceLine } from '@tradeflow/db';
import { createInvoiceSchema, updateInvoiceSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';
import { computeSalesDocumentTotals } from '../services/salesTotals';
import { runInTransaction } from '../services/inventoryService';
import { postInvoice, resolveInvoiceDueDate } from '../services/invoicePosting';

export const invoicesRouter = Router();
invoicesRouter.use(authMiddleware, loadUser);

async function pdfHandler(req: express.Request, res: express.Response) {
  const inv = await dataSource.getRepository(Invoice).findOne({
    where: { id: req.params.id },
    relations: ['lines', 'lines.product', 'customer', 'warehouse'],
  });
  if (!inv) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const cust =
    inv.customer ||
    (await dataSource.getRepository(Customer).findOne({ where: { id: inv.customerId, deletedAt: IsNull() } }));
  const name = cust?.name ?? 'Customer';
  const rows =
    inv.lines
      ?.map(
        (l) => `<tr>
    <td>${escapeHtml(l.product?.name ?? l.productId)}</td>
    <td style="text-align:right">${l.quantity}</td>
    <td style="text-align:right">${l.unitPrice}</td>
    <td style="text-align:right">${l.discountAmount}</td>
    <td style="text-align:right">${l.taxAmount}</td>
    <td style="text-align:right">${(
      parseFloat(l.quantity) * parseFloat(l.unitPrice) -
      parseFloat(l.discountAmount) +
      parseFloat(l.taxAmount)
    ).toFixed(4)}</td>
  </tr>`
      )
      .join('') ?? '';
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Invoice ${inv.id.slice(0, 8)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 800px; margin: 24px auto; color: #111; }
  h1 { font-size: 1.5rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { border: 1px solid #ccc; padding: 8px; font-size: 14px; }
  th { background: #f4f4f5; text-align: left; }
  .totals { margin-top: 16px; text-align: right; }
</style></head><body>
  <h1>Tax invoice</h1>
  <p><strong>${escapeHtml(name)}</strong><br/>
  Date: ${inv.invoiceDate} · Due: ${inv.dueDate} · Status: ${inv.status}</p>
  <p>Warehouse: ${escapeHtml(inv.warehouse?.name ?? inv.warehouseId)} · Payment: ${inv.paymentType}</p>
  <table>
    <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Disc</th><th>Tax</th><th>Line</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <p>Subtotal: ${inv.subtotal}</p>
    <p>Discount: ${inv.discountAmount}</p>
    <p>Tax: ${inv.taxAmount}</p>
    <p><strong>Total: ${inv.total}</strong></p>
  </div>
  <script>window.onload = function() { window.print(); }</script>
</body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
    subtotal: inv.subtotal,
    taxAmount: inv.taxAmount,
    discountAmount: inv.discountAmount,
    total: inv.total,
    notes: inv.notes,
    branchId: inv.branchId,
    createdBy: inv.createdBy,
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
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
        where: { id: inv.id },
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
    where: { id: req.params.id },
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
          where: { id: req.params.id },
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
        if (b.branchId !== undefined) inv.branchId = b.branchId ?? undefined;

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
        return manager.findOneOrFail(Invoice, { where: { id: inv.id }, relations: ['lines'] });
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
  auditMiddleware({ entity: 'Invoice', getEntityId: (req) => req.params.id }),
  async (req, res) => {
    const inv = await dataSource.getRepository(Invoice).findOne({ where: { id: req.params.id } });
    if (!inv) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (inv.status !== 'draft') {
      res.status(400).json({ error: 'Only draft invoices can be deleted' });
      return;
    }
    await dataSource.getRepository(Invoice).delete({ id: inv.id });
    res.json({ data: { id: inv.id, deleted: true } });
  }
);
