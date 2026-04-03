import { Router } from 'express';
import {
  dataSource,
  Quotation,
  QuotationLine,
  SalesOrder,
  SalesOrderLine,
} from '@tradeflow/db';
import { createQuotationSchema, updateQuotationSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';
import { computeSalesDocumentTotals } from '../services/salesTotals';
import { runInTransaction } from '../services/inventoryService';

export const quotationsRouter = Router();
quotationsRouter.use(authMiddleware, loadUser);

function serializeQ(q: Quotation, lines?: QuotationLine[]) {
  return {
    id: q.id,
    customerId: q.customerId,
    quotationDate: q.quotationDate,
    validUntil: q.validUntil,
    status: q.status,
    subtotal: q.subtotal,
    taxAmount: q.taxAmount,
    discountAmount: q.discountAmount,
    total: q.total,
    notes: q.notes,
    branchId: q.branchId,
    createdBy: q.createdBy,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    lines:
      lines?.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxAmount: l.taxAmount,
        discountAmount: l.discountAmount,
        taxProfileId: l.taxProfileId,
      })) ?? undefined,
  };
}

quotationsRouter.get('/', requirePermission('sales', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const { limit, offset } = getPagination(req);
  const qb = dataSource
    .getRepository(Quotation)
    .createQueryBuilder('q')
    .orderBy('q.quotation_date', 'DESC')
    .addOrderBy('q.created_at', 'DESC')
    .take(limit)
    .skip(offset);
  if (branchId) qb.andWhere('(q.branch_id IS NULL OR q.branch_id = :bid)', { bid: branchId });
  if (req.query.customerId) qb.andWhere('q.customer_id = :cid', { cid: req.query.customerId });
  const [rows, total] = await qb.getManyAndCount();
  res.json({ data: rows.map((q) => serializeQ(q)), meta: { total, limit, offset } });
});

quotationsRouter.get('/:id', requirePermission('sales', 'read'), async (req, res) => {
  const row = await dataSource.getRepository(Quotation).findOne({
    where: { id: req.params.id },
    relations: ['lines', 'lines.product'],
  });
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ data: serializeQ(row, row.lines) });
});

quotationsRouter.post(
  '/',
  requirePermission('sales', 'create'),
  auditMiddleware({ entity: 'Quotation', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createQuotationSchema.safeParse(req.body);
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
        const q = manager.create(Quotation, {
          customerId: b.customerId,
          quotationDate: b.quotationDate.slice(0, 10),
          validUntil: b.validUntil?.slice(0, 10) ?? undefined,
          status: 'draft',
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          discountAmount: totals.discountAmount,
          total: totals.total,
          notes: b.notes ?? undefined,
          branchId: b.branchId ?? req.user?.branchId ?? undefined,
          createdBy: req.auth?.userId,
        });
        await manager.save(q);
        for (let i = 0; i < totals.lines.length; i++) {
          const l = totals.lines[i];
          const il = manager.create(QuotationLine, {
            quotationId: q.id,
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxAmount: l.taxAmount,
            discountAmount: l.discountAmount,
            taxProfileId: l.taxProfileId ?? undefined,
          });
          await manager.save(il);
        }
        return manager.findOneOrFail(Quotation, { where: { id: q.id }, relations: ['lines'] });
      });
      res.status(201).json({ data: serializeQ(saved, saved.lines) });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);

quotationsRouter.patch(
  '/:id',
  requirePermission('sales', 'update'),
  auditMiddleware({
    entity: 'Quotation',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = updateQuotationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    try {
      const saved = await runInTransaction(async (manager) => {
        const q = await manager.findOne(Quotation, {
          where: { id: req.params.id },
          relations: ['lines'],
        });
        if (!q) throw new Error('Not found');
        if (q.status !== 'draft') throw new Error('Only draft quotations can be edited');
        const b = parsed.data;
        if (b.customerId !== undefined) q.customerId = b.customerId;
        if (b.quotationDate !== undefined) q.quotationDate = b.quotationDate.slice(0, 10);
        if (b.validUntil !== undefined) q.validUntil = b.validUntil?.slice(0, 10) ?? undefined;
        if (b.notes !== undefined) q.notes = b.notes ?? undefined;
        if (b.branchId !== undefined) q.branchId = b.branchId ?? undefined;

        if (b.lines) {
          await manager.delete(QuotationLine, { quotationId: q.id });
          const totals = await computeSalesDocumentTotals(
            manager,
            q.customerId,
            b.lines.map((l) => ({
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discountAmount: l.discountAmount,
              taxProfileId: l.taxProfileId,
            })),
            b.discountAmount !== undefined ? b.discountAmount : q.discountAmount
          );
          q.subtotal = totals.subtotal;
          q.taxAmount = totals.taxAmount;
          q.discountAmount = totals.discountAmount;
          q.total = totals.total;
          for (const l of totals.lines) {
            await manager.save(
              manager.create(QuotationLine, {
                quotationId: q.id,
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
          const lines = (q.lines || []).map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountAmount: l.discountAmount,
            taxProfileId: l.taxProfileId,
          }));
          const totals = await computeSalesDocumentTotals(manager, q.customerId, lines, b.discountAmount);
          q.subtotal = totals.subtotal;
          q.taxAmount = totals.taxAmount;
          q.discountAmount = totals.discountAmount;
          q.total = totals.total;
          await manager.delete(QuotationLine, { quotationId: q.id });
          for (const l of totals.lines) {
            await manager.save(
              manager.create(QuotationLine, {
                quotationId: q.id,
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
        await manager.save(q);
        return manager.findOneOrFail(Quotation, { where: { id: q.id }, relations: ['lines'] });
      });
      res.json({ data: serializeQ(saved, saved.lines) });
    } catch (e) {
      const msg = (e as Error).message;
      res.status(msg === 'Not found' ? 404 : 400).json({ error: msg });
    }
  }
);

quotationsRouter.delete(
  '/:id',
  requirePermission('sales', 'update'),
  auditMiddleware({ entity: 'Quotation', getEntityId: (req) => req.params.id }),
  async (req, res) => {
    const q = await dataSource.getRepository(Quotation).findOne({ where: { id: req.params.id } });
    if (!q) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (q.status !== 'draft') {
      res.status(400).json({ error: 'Only draft quotations can be deleted' });
      return;
    }
    await dataSource.getRepository(Quotation).delete({ id: q.id });
    res.json({ data: { id: q.id, deleted: true } });
  }
);

quotationsRouter.post(
  '/:id/convert-to-order',
  requirePermission('sales', 'update'),
  auditMiddleware({ entity: 'Quotation', getEntityId: (req) => req.params.id }),
  async (req, res) => {
    try {
      const so = await runInTransaction(async (manager) => {
        const q = await manager.findOne(Quotation, {
          where: { id: req.params.id },
          relations: ['lines'],
        });
        if (!q) throw new Error('Not found');
        if (q.status === 'void') throw new Error('Void quotation cannot convert');
        if (!q.lines?.length) throw new Error('Quotation has no lines');

        const order = manager.create(SalesOrder, {
          customerId: q.customerId,
          orderDate: new Date().toISOString().slice(0, 10),
          status: 'draft',
          warehouseId: undefined,
          subtotal: q.subtotal,
          taxAmount: q.taxAmount,
          discountAmount: q.discountAmount,
          total: q.total,
          notes: q.notes,
          branchId: q.branchId,
          createdBy: req.auth?.userId,
        });
        await manager.save(order);
        for (const l of q.lines) {
          await manager.save(
            manager.create(SalesOrderLine, {
              salesOrderId: order.id,
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              taxAmount: l.taxAmount,
              discountAmount: l.discountAmount,
              deliveredQuantity: '0.0000',
              taxProfileId: l.taxProfileId,
            })
          );
        }
        q.status = 'confirmed';
        await manager.save(q);
        return manager.findOneOrFail(SalesOrder, { where: { id: order.id }, relations: ['lines'] });
      });
      res.status(201).json({
        data: {
          salesOrderId: so.id,
          customerId: so.customerId,
          orderDate: so.orderDate,
          status: so.status,
          total: so.total,
          lines: so.lines?.map((l) => ({
            id: l.id,
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            deliveredQuantity: l.deliveredQuantity,
          })),
        },
      });
    } catch (e) {
      const msg = (e as Error).message;
      res.status(msg === 'Not found' ? 404 : 400).json({ error: msg });
    }
  }
);
