import { Router } from 'express';
import {
  dataSource,
  Product,
  SalesOrder,
  SalesOrderLine,
  Invoice,
  InvoiceLine,
} from '@tradeflow/db';
import {
  createSalesOrderSchema,
  convertOrderToInvoiceSchema,
  updateSalesOrderSchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';
import { computeSalesDocumentTotals } from '../services/salesTotals';
import { runInTransaction } from '../services/inventoryService';
import { resolveInvoiceDueDate } from '../services/invoicePosting';

export const salesOrdersRouter = Router();
salesOrdersRouter.use(authMiddleware, loadUser);

function serialize(o: SalesOrder, lines?: Array<SalesOrderLine & { product?: Product }>) {
  return {
    id: o.id,
    customerId: o.customerId,
    orderDate: o.orderDate,
    status: o.status,
    warehouseId: o.warehouseId,
    subtotal: o.subtotal,
    taxAmount: o.taxAmount,
    discountAmount: o.discountAmount,
    total: o.total,
    notes: o.notes,
    branchId: o.branchId,
    salespersonId: o.salespersonId,
    createdBy: o.createdBy,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    lines:
      lines?.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxAmount: l.taxAmount,
        discountAmount: l.discountAmount,
        deliveredQuantity: l.deliveredQuantity,
        taxProfileId: l.taxProfileId,
        product: l.product ? { sku: l.product.sku, name: l.product.name } : undefined,
      })) ?? undefined,
  };
}

salesOrdersRouter.get('/', requirePermission('sales', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const { limit, offset } = getPagination(req);
  const qb = dataSource
    .getRepository(SalesOrder)
    .createQueryBuilder('o')
    .orderBy('o.order_date', 'DESC')
    .take(limit)
    .skip(offset);
  if (branchId) qb.andWhere('(o.branch_id IS NULL OR o.branch_id = :bid)', { bid: branchId });
  if (req.query.customerId) qb.andWhere('o.customer_id = :cid', { cid: req.query.customerId });
  const [rows, total] = await qb.getManyAndCount();
  res.json({ data: rows.map((o) => serialize(o)), meta: { total, limit, offset } });
});

salesOrdersRouter.get('/:id', requirePermission('sales', 'read'), async (req, res) => {
  const row = await dataSource.getRepository(SalesOrder).findOne({
    where: { id: req.params.id },
    relations: ['lines', 'lines.product'],
  });
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ data: serialize(row, row.lines) });
});

salesOrdersRouter.post(
  '/',
  requirePermission('sales', 'create'),
  auditMiddleware({ entity: 'SalesOrder', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createSalesOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    try {
      const saved = await runInTransaction(async (manager) => {
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
        const o = manager.create(SalesOrder, {
          customerId: b.customerId,
          orderDate: b.orderDate.slice(0, 10),
          status: 'draft',
          warehouseId: b.warehouseId ?? undefined,
          salespersonId: b.salespersonId ?? undefined,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          discountAmount: totals.discountAmount,
          total: totals.total,
          notes: b.notes ?? undefined,
          branchId: b.branchId ?? req.user?.branchId ?? undefined,
          createdBy: req.auth?.userId,
        });
        await manager.save(o);
        for (const l of totals.lines) {
          await manager.save(
            manager.create(SalesOrderLine, {
              salesOrderId: o.id,
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              taxAmount: l.taxAmount,
              discountAmount: l.discountAmount,
              deliveredQuantity: '0.0000',
              taxProfileId: l.taxProfileId ?? undefined,
            })
          );
        }
        return manager.findOneOrFail(SalesOrder, { where: { id: o.id }, relations: ['lines'] });
      });
      res.status(201).json({ data: serialize(saved, saved.lines) });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);

salesOrdersRouter.patch(
  '/:id',
  requirePermission('sales', 'update'),
  auditMiddleware({
    entity: 'SalesOrder',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = updateSalesOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    try {
      const saved = await runInTransaction(async (manager) => {
        const o = await manager.findOne(SalesOrder, {
          where: { id: req.params.id },
          relations: ['lines'],
        });
        if (!o) throw new Error('Not found');
        if (o.status !== 'draft') throw new Error('Only draft sales orders can be edited');
        const b = parsed.data;
        if (b.customerId !== undefined) o.customerId = b.customerId;
        if (b.orderDate !== undefined) o.orderDate = b.orderDate.slice(0, 10);
        if (b.warehouseId !== undefined) o.warehouseId = b.warehouseId ?? undefined;
        if (b.salespersonId !== undefined) o.salespersonId = b.salespersonId ?? undefined;
        if (b.notes !== undefined) o.notes = b.notes ?? undefined;
        if (b.branchId !== undefined) o.branchId = b.branchId ?? undefined;

        if (b.lines) {
          await manager.delete(SalesOrderLine, { salesOrderId: o.id });
          const totals = await computeSalesDocumentTotals(
            manager,
            o.customerId,
            b.lines.map((l) => ({
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discountAmount: l.discountAmount,
              taxProfileId: l.taxProfileId,
            })),
            b.discountAmount !== undefined ? b.discountAmount : o.discountAmount
          );
          o.subtotal = totals.subtotal;
          o.taxAmount = totals.taxAmount;
          o.discountAmount = totals.discountAmount;
          o.total = totals.total;
          for (const l of totals.lines) {
            await manager.save(
              manager.create(SalesOrderLine, {
                salesOrderId: o.id,
                productId: l.productId,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                taxAmount: l.taxAmount,
                discountAmount: l.discountAmount,
                deliveredQuantity: '0.0000',
                taxProfileId: l.taxProfileId ?? undefined,
              })
            );
          }
        } else if (b.discountAmount !== undefined) {
          const lines = (o.lines || []).map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountAmount: l.discountAmount,
            taxProfileId: l.taxProfileId,
          }));
          const totals = await computeSalesDocumentTotals(manager, o.customerId, lines, b.discountAmount);
          o.subtotal = totals.subtotal;
          o.taxAmount = totals.taxAmount;
          o.discountAmount = totals.discountAmount;
          o.total = totals.total;
          await manager.delete(SalesOrderLine, { salesOrderId: o.id });
          for (const l of totals.lines) {
            await manager.save(
              manager.create(SalesOrderLine, {
                salesOrderId: o.id,
                productId: l.productId,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                taxAmount: l.taxAmount,
                discountAmount: l.discountAmount,
                deliveredQuantity: '0.0000',
                taxProfileId: l.taxProfileId ?? undefined,
              })
            );
          }
        }
        await manager.save(o);
        return manager.findOneOrFail(SalesOrder, { where: { id: o.id }, relations: ['lines'] });
      });
      res.json({ data: serialize(saved, saved.lines) });
    } catch (e) {
      const msg = (e as Error).message;
      res.status(msg === 'Not found' ? 404 : 400).json({ error: msg });
    }
  }
);

salesOrdersRouter.post(
  '/:id/confirm',
  requirePermission('sales', 'update'),
  auditMiddleware({ entity: 'SalesOrder', getEntityId: (req) => req.params.id }),
  async (req, res) => {
    const o = await dataSource.getRepository(SalesOrder).findOne({ where: { id: req.params.id } });
    if (!o) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (o.status === 'void') {
      res.status(400).json({ error: 'Order is void' });
      return;
    }
    o.status = 'confirmed';
    await dataSource.getRepository(SalesOrder).save(o);
    res.json({ data: serialize(o) });
  }
);

salesOrdersRouter.delete(
  '/:id',
  requirePermission('sales', 'update'),
  auditMiddleware({ entity: 'SalesOrder', getEntityId: (req) => req.params.id }),
  async (req, res) => {
    const o = await dataSource.getRepository(SalesOrder).findOne({ where: { id: req.params.id } });
    if (!o) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (o.status !== 'draft') {
      res.status(400).json({ error: 'Only draft orders can be deleted' });
      return;
    }
    await dataSource.getRepository(SalesOrder).delete({ id: o.id });
    res.json({ data: { id: o.id, deleted: true } });
  }
);

salesOrdersRouter.post(
  '/:id/convert-to-invoice',
  requirePermission('sales', 'update'),
  auditMiddleware({ entity: 'SalesOrder', getEntityId: (req) => req.params.id }),
  async (req, res) => {
    const parsed = convertOrderToInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const warehouseId = b.warehouseId;
    const paymentType = b.paymentType ?? 'credit';
    const invoiceDate = b.invoiceDate?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const dueDateBody = b.dueDate;

    try {
      const inv = await runInTransaction(async (manager) => {
        const o = await manager.findOne(SalesOrder, {
          where: { id: req.params.id },
          relations: ['lines'],
        });
        if (!o) throw new Error('Not found');
        if (o.status === 'void') throw new Error('Void order cannot invoice');

        const lineInputs: Array<{
          productId: string;
          quantity: string;
          unitPrice: string;
          discountAmount: string;
          taxProfileId?: string;
          salesOrderLineId: string;
        }> = [];

        for (const pl of b.lines) {
          const sol = o.lines?.find((x) => x.id === pl.salesOrderLineId);
          if (!sol) throw new Error(`Unknown sales order line ${pl.salesOrderLineId}`);
          const qty = parseFloat(pl.quantity);
          if (qty <= 0) throw new Error('Invoice quantity must be positive');
          const remaining =
            parseFloat(sol.quantity) - parseFloat(sol.deliveredQuantity) + 1e-9;
          if (qty > remaining) throw new Error('Quantity exceeds remaining on sales order line');
          lineInputs.push({
            productId: sol.productId,
            quantity: pl.quantity,
            unitPrice: sol.unitPrice,
            discountAmount: sol.discountAmount,
            taxProfileId: sol.taxProfileId,
            salesOrderLineId: sol.id,
          });
        }

        const invDisc = b.discountAmount ?? '0.0000';
        const totals = await computeSalesDocumentTotals(
          manager,
          o.customerId,
          lineInputs.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountAmount: l.discountAmount,
            taxProfileId: l.taxProfileId,
          })),
          invDisc
        );

        const due = await resolveInvoiceDueDate(
          manager,
          o.customerId,
          invoiceDate,
          paymentType,
          dueDateBody ?? null
        );

        const invoice = manager.create(Invoice, {
          customerId: o.customerId,
          invoiceDate,
          dueDate: due,
          status: 'draft',
          paymentType: paymentType === 'cash' ? 'cash' : 'credit',
          warehouseId,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          discountAmount: totals.discountAmount,
          total: totals.total,
          notes: o.notes,
          salesOrderId: o.id,
          salespersonId: o.salespersonId,
          branchId: o.branchId,
          createdBy: req.auth?.userId,
        });
        await manager.save(invoice);

        for (let i = 0; i < totals.lines.length; i++) {
          const l = totals.lines[i];
          const meta = lineInputs[i];
          await manager.save(
            manager.create(InvoiceLine, {
              invoiceId: invoice.id,
              productId: l.productId,
              salesOrderLineId: meta.salesOrderLineId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              taxAmount: l.taxAmount,
              discountAmount: l.discountAmount,
              taxProfileId: l.taxProfileId ?? undefined,
            })
          );
        }

        return manager.findOneOrFail(Invoice, { where: { id: invoice.id }, relations: ['lines'] });
      });

      res.status(201).json({
        data: {
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
          lines: inv.lines?.map((l) => ({
            id: l.id,
            productId: l.productId,
            salesOrderLineId: l.salesOrderLineId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxAmount: l.taxAmount,
            discountAmount: l.discountAmount,
          })),
        },
      });
    } catch (e) {
      const msg = (e as Error).message;
      res.status(msg === 'Not found' ? 404 : 400).json({ error: msg });
    }
  }
);
