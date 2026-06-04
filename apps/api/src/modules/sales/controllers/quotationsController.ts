import type { Request } from 'express';
import type { z } from 'zod';
import { Quotation, QuotationLine, SalesOrder, SalesOrderLine } from '@tradeflow/db';
import { createQuotationSchema, listQuotationsQuerySchema, updateQuotationSchema } from '@tradeflow/shared';
import { getValidatedQuery } from '../../../shared/middleware/validate';
import { getPaginationFromQuery } from '../../../shared/utils/pagination';
import { computeSalesDocumentTotals } from '../services/salesTotals';
import { runInTransaction } from '../../inventory/services/inventoryService';
import { created, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';

type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;

export function serializeQuotation(q: Quotation, lines?: QuotationLine[]) {
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

type ListQuotationsQuery = z.infer<typeof listQuotationsQuerySchema>;

export async function listQuotations(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<ListQuotationsQuery>(req);
  const { limit, offset } = getPaginationFromQuery(q);
  const qb = Quotation.createQueryBuilder('q')
    .orderBy('q.quotation_date', 'DESC')
    .addOrderBy('q.created_at', 'DESC')
    .take(limit)
    .skip(offset);
  if (q.customerId) qb.andWhere('q.customer_id = :cid', { cid: q.customerId });
  const [rows, total] = await qb.getManyAndCount();
  return ok({ data: rows.map((q) => serializeQuotation(q)), meta: { total, limit, offset } });
}

export async function getQuotation(req: Request): Promise<ControllerResult> {
  const row = await Quotation.findOne({
    where: { id: req.params.id },
    relations: ['lines', 'lines.product'],
  });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  return ok({ data: serializeQuotation(row, row.lines) });
}

export async function createQuotation(req: Request, body: CreateQuotationInput): Promise<ControllerResult> {
  const b = body;
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
  return created({ data: serializeQuotation(saved, saved.lines) });
}

export async function updateQuotation(req: Request, body: UpdateQuotationInput): Promise<ControllerResult> {
  const parsed = body;
  const saved = await runInTransaction(async (manager) => {
    const q = await manager.findOne(Quotation, {
      where: { id: req.params.id },
      relations: ['lines'],
    });
    if (!q) throw new HttpError(404, { error: 'Not found' });
    if (q.status !== 'draft') throw new HttpError(400, { error: 'Only draft quotations can be edited' });
    const b = parsed;
    if (b.customerId !== undefined) q.customerId = b.customerId;
    if (b.quotationDate !== undefined) q.quotationDate = b.quotationDate.slice(0, 10);
    if (b.validUntil !== undefined) q.validUntil = b.validUntil?.slice(0, 10) ?? undefined;
    if (b.notes !== undefined) q.notes = b.notes ?? undefined;

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
        quantity: parseFloat(l.quantity),
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
  return ok({ data: serializeQuotation(saved, saved.lines) });
}

export async function deleteQuotation(req: Request): Promise<ControllerResult> {
  const q = await Quotation.findOne({ where: { id: req.params.id } });
  if (!q) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (q.status !== 'draft') {
    throw new HttpError(400, { error: 'Only draft quotations can be deleted' });
  }
  await Quotation.delete({ id: q.id });
  return ok({ data: { id: q.id, deleted: true } });
}

export async function convertQuotationToOrder(req: Request): Promise<ControllerResult> {
  const so = await runInTransaction(async (manager) => {
    const q = await manager.findOne(Quotation, {
      where: { id: req.params.id },
      relations: ['lines'],
    });
    if (!q) throw new HttpError(404, { error: 'Not found' });
    if (q.status === 'void') throw new HttpError(400, { error: 'Void quotation cannot convert' });
    if (!q.lines?.length) throw new HttpError(400, { error: 'Quotation has no lines' });

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
  return created({
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
}
