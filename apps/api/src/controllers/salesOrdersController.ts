import type { Request } from 'express';
import type { EntityManager } from 'typeorm';
import { IsNull } from 'typeorm';
import type { z } from 'zod';
import { Product, SalesOrder, SalesOrderLine, Invoice, InvoiceLine } from '@tradeflow/db';
import {
  bulkSalesOrdersSchema,
  createSalesOrderSchema,
  convertOrderToInvoiceSchema,
  updateSalesOrderSchema,
  SalesOrderStatus,
} from '@tradeflow/shared';
import { getPagination } from '../utils/pagination';
import { computeSalesDocumentTotals } from '../services/salesTotals';
import { runInTransaction } from '../services/inventoryService';
import { resolveInvoiceDueDate } from '../services/invoicePosting';
import { created, ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';
import {
  assertNoOtherInvoiceForSalesOrder,
  assertSalesOrderConfirmedForInvoice,
} from '../services/salesOrderInvoiceGuard';
import { assertSalesOrderLinesInStock } from '../services/salesOrderStockValidation';
import { calculateBonus, calculateBonusBatch } from '../services/bonusService';

type CreateSalesOrderInput = z.infer<typeof createSalesOrderSchema>;
type UpdateSalesOrderInput = z.infer<typeof updateSalesOrderSchema>;
type ConvertOrderToInvoiceInput = z.infer<typeof convertOrderToInvoiceSchema>;
type BulkSalesOrdersInput = z.infer<typeof bulkSalesOrdersSchema>;

type SalesOrderLineInput = {
  productId: string;
  quantity: number;
  unitPrice: string;
  discountAmount?: string;
  taxProfileId?: string | null;
};

async function attachSalesOrderLineBonuses(
  manager: EntityManager,
  lines: SalesOrderLineInput[]
): Promise<Array<SalesOrderLineInput & { bonusQuantity: string }>> {
  const bonusMap = await calculateBonusBatch(
    manager,
    lines.map((l) => ({ productId: l.productId, quantity: l.quantity }))
  );
  return lines.map((l) => ({
    ...l,
    bonusQuantity: bonusMap.get(`${l.productId}:${l.quantity}`) ?? '0.0000',
  }));
}

function stockQtyForLine(quantity: number, bonusQuantity: string): number {
  return quantity + parseFloat(bonusQuantity || '0');
}

export function serializeSalesOrder(
  o: SalesOrder,
  lines?: Array<SalesOrderLine & { product?: Product }>,
  opts?: { hasInvoice?: boolean; lineCount?: number }
) {
  const lineCount = opts?.lineCount !== undefined ? opts.lineCount : (lines?.length ?? 0);
  return {
    id: o.id,
    customerId: o.customerId,
    customerName: o.customer?.name ?? null,
    orderDate: o.orderDate,
    status: o.status,
    hasInvoice: opts?.hasInvoice ?? false,
    warehouseId: o.warehouseId,
    warehouseName: o.warehouse?.name ?? null,
    salespersonName: o.salesperson?.name ?? null,
    lineCount,
    subtotal: o.subtotal,
    taxAmount: o.taxAmount,
    discountAmount: o.discountAmount,
    total: o.total,
    notes: o.notes,
    salespersonId: o.salespersonId,
    createdBy: o.createdBy,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    lines:
      lines?.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        bonusQuantity: l.bonusQuantity ?? '0',
        unitPrice: l.unitPrice,
        taxAmount: l.taxAmount,
        discountAmount: l.discountAmount,
        deliveredQuantity: l.deliveredQuantity,
        taxProfileId: l.taxProfileId,
        product: l.product ? { sku: l.product.sku, name: l.product.name } : undefined,
      })) ?? undefined,
  };
}

export async function listSalesOrders(req: Request): Promise<ControllerResult> {
  const { limit, offset } = getPagination(req);
  const qb = SalesOrder.createQueryBuilder('o')
    .leftJoinAndSelect('o.customer', 'customer')
    .leftJoinAndSelect('o.warehouse', 'warehouse')
    .leftJoinAndSelect('o.salesperson', 'salesperson')
    .orderBy('o.orderDate', 'DESC')
    .addOrderBy('o.createdAt', 'DESC')
    .take(limit)
    .skip(offset);

  if (req.query.customerId) {
    qb.andWhere('o.customerId = :cid', { cid: req.query.customerId });
  }
  if (req.query.status) {
    qb.andWhere('o.status = :st', { st: req.query.status });
  }
  if (req.query.dateFrom) {
    qb.andWhere('o.orderDate >= :df', { df: req.query.dateFrom });
  }
  if (req.query.dateTo) {
    qb.andWhere('o.orderDate <= :dt', { dt: req.query.dateTo });
  }
  if (req.query.warehouseId) {
    qb.andWhere('o.warehouseId = :wid', { wid: req.query.warehouseId });
  }
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q) {
    qb.andWhere('(customer.name ILIKE :search OR customer.longName ILIKE :search)', {
      search: `%${q}%`,
    });
  }
  if (req.query.hasInvoice === 'true') {
    qb.andWhere(`EXISTS (SELECT 1 FROM invoices i WHERE i.sales_order_id = o.id AND i.deleted_at IS NULL)`);
  } else if (req.query.hasInvoice === 'false') {
    qb.andWhere(
      `NOT EXISTS (SELECT 1 FROM invoices i WHERE i.sales_order_id = o.id AND i.deleted_at IS NULL)`
    );
  }

  const [rows, total] = await qb.getManyAndCount();

  let invoicedOrderIds = new Set<string>();
  const lineCountById = new Map<string, number>();
  if (rows.length > 0) {
    const ids = rows.map((o) => o.id);
    const links = await Invoice.createQueryBuilder('i')
      .select('i.salesOrderId', 'soId')
      .where('i.salesOrderId IN (:...ids)', { ids })
      .andWhere('i.deletedAt IS NULL')
      .getRawMany<{ soId: string | null }>();
    invoicedOrderIds = new Set(links.map((l) => l.soId).filter((id): id is string => !!id));

    const cntRows = await SalesOrderLine.createQueryBuilder('sol')
      .select('sol.salesOrderId', 'oid')
      .addSelect('COUNT(sol.id)', 'cnt')
      .where('sol.salesOrderId IN (:...ids)', { ids })
      .groupBy('sol.salesOrderId')
      .getRawMany<{ oid: string; cnt: string }>();
    for (const r of cntRows) {
      lineCountById.set(r.oid, parseInt(r.cnt, 10));
    }
  }

  return ok({
    data: rows.map((o) =>
      serializeSalesOrder(o, undefined, {
        hasInvoice: invoicedOrderIds.has(o.id),
        lineCount: lineCountById.get(o.id) ?? 0,
      })
    ),
    meta: { total, limit, offset },
  });
}

export async function getSalesOrder(req: Request): Promise<ControllerResult> {
  const row = await SalesOrder.findOne({
    where: { id: req.params.id },
    relations: ['lines', 'lines.product', 'customer', 'warehouse', 'salesperson'],
  });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  const invCount = await Invoice.count({
    where: { salesOrderId: row.id, deletedAt: IsNull() },
  });
  return ok({
    data: serializeSalesOrder(row, row.lines, {
      hasInvoice: invCount > 0,
      lineCount: row.lines?.length ?? 0,
    }),
  });
}

export async function bulkSalesOrders(req: Request, body: BulkSalesOrdersInput): Promise<ControllerResult> {
  const uniqueIds = [...new Set(body.ids)];
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const id of uniqueIds) {
    try {
      if (body.action === 'confirm') {
        const o = await SalesOrder.findOne({ where: { id } });
        if (!o) {
          results.push({ id, ok: false, error: 'Not found' });
          continue;
        }
        if (o.status === 'void') {
          results.push({ id, ok: false, error: 'Order is void' });
          continue;
        }
        if (o.status === 'confirmed') {
          results.push({ id, ok: true });
          continue;
        }
        o.status = 'confirmed';
        await SalesOrder.save(o);
        results.push({ id, ok: true });
      } else {
        const o = await SalesOrder.findOne({ where: { id } });
        if (!o) {
          results.push({ id, ok: false, error: 'Not found' });
          continue;
        }
        if (o.status !== SalesOrderStatus.DRAFT) {
          results.push({ id, ok: false, error: 'Only draft orders can be deleted' });
          continue;
        }
        await SalesOrder.delete({ id: o.id });
        results.push({ id, ok: true });
      }
    } catch (e) {
      results.push({ id, ok: false, error: (e as Error).message });
    }
  }

  return ok({ data: { results } });
}

export async function createSalesOrder(req: Request, body: CreateSalesOrderInput): Promise<ControllerResult> {
  const b = body;
  try {
    const saved = await runInTransaction(async (manager) => {
      const linesWithBonus = await attachSalesOrderLineBonuses(manager, b.lines);
      await assertSalesOrderLinesInStock(
        manager,
        b.warehouseId ?? undefined,
        linesWithBonus.map((l) => ({
          productId: l.productId,
          quantity: stockQtyForLine(l.quantity, l.bonusQuantity),
        }))
      );
      const totals = await computeSalesDocumentTotals(
        manager,
        b.customerId,
        linesWithBonus.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          bonusQuantity: l.bonusQuantity,
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
        createdBy: req.auth?.userId,
      });
      await manager.save(o);
      for (let i = 0; i < totals.lines.length; i++) {
        const l = totals.lines[i];
        const meta = linesWithBonus[i];
        await manager.save(
          manager.create(SalesOrderLine, {
            salesOrderId: o.id,
            productId: l.productId,
            quantity: l.quantity,
            bonusQuantity: meta.bonusQuantity,
            unitPrice: l.unitPrice,
            taxAmount: l.taxAmount,
            discountAmount: l.discountAmount,
            deliveredQuantity: '0.0000',
            taxProfileId: l.taxProfileId ?? undefined,
          })
        );
      }
      return manager.findOneOrFail(SalesOrder, {
        where: { id: o.id },
        relations: ['lines', 'lines.product', 'customer', 'warehouse', 'salesperson'],
      });
    });
    return created({
      data: serializeSalesOrder(saved, saved.lines, {
        hasInvoice: false,
        lineCount: saved.lines?.length ?? 0,
      }),
    });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, { error: (e as Error).message });
  }
}

export async function updateSalesOrder(req: Request, body: UpdateSalesOrderInput): Promise<ControllerResult> {
  const b = body;
  try {
    const saved = await runInTransaction(async (manager) => {
      const o = await manager.findOne(SalesOrder, {
        where: { id: req.params.id },
      });
      if (!o) throw new HttpError(404, { error: 'Not found' });
      if (o.status !== 'draft') throw new HttpError(400, { error: 'Only draft sales orders can be edited' });

      if (b.customerId !== undefined) o.customerId = b.customerId;
      if (b.orderDate !== undefined) o.orderDate = b.orderDate.slice(0, 10);
      if (b.warehouseId !== undefined) o.warehouseId = b.warehouseId ?? undefined;
      if (b.salespersonId !== undefined) o.salespersonId = b.salespersonId ?? undefined;
      if (b.notes !== undefined) o.notes = b.notes ?? undefined;

      if (b.lines) {
        const linesWithBonus = await attachSalesOrderLineBonuses(manager, b.lines);
        await assertSalesOrderLinesInStock(
          manager,
          o.warehouseId,
          linesWithBonus.map((l) => ({
            productId: l.productId,
            quantity: stockQtyForLine(l.quantity, l.bonusQuantity),
          }))
        );
        await manager.delete(SalesOrderLine, { salesOrderId: o.id });
        const totals = await computeSalesDocumentTotals(
          manager,
          o.customerId,
          linesWithBonus.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            bonusQuantity: l.bonusQuantity,
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
        for (let i = 0; i < totals.lines.length; i++) {
          const l = totals.lines[i];
          const meta = linesWithBonus[i];
          await manager.save(
            manager.create(SalesOrderLine, {
              salesOrderId: o.id,
              productId: l.productId,
              quantity: l.quantity,
              bonusQuantity: meta.bonusQuantity,
              unitPrice: l.unitPrice,
              taxAmount: l.taxAmount,
              discountAmount: l.discountAmount,
              deliveredQuantity: '0.0000',
              taxProfileId: l.taxProfileId ?? undefined,
            })
          );
        }
      } else if (b.discountAmount !== undefined) {
        const dbLines = await manager.find(SalesOrderLine, { where: { salesOrderId: o.id } });
        await assertSalesOrderLinesInStock(
          manager,
          o.warehouseId,
          dbLines.map((l) => ({
            productId: l.productId,
            quantity: stockQtyForLine(parseFloat(l.quantity), l.bonusQuantity ?? '0'),
          }))
        );
        const lines = dbLines.map((l) => ({
          productId: l.productId,
          quantity: parseFloat(l.quantity),
          bonusQuantity: l.bonusQuantity ?? '0',
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
        for (let i = 0; i < totals.lines.length; i++) {
          const l = totals.lines[i];
          const meta = lines[i];
          await manager.save(
            manager.create(SalesOrderLine, {
              salesOrderId: o.id,
              productId: l.productId,
              quantity: l.quantity,
              bonusQuantity: meta.bonusQuantity,
              unitPrice: l.unitPrice,
              taxAmount: l.taxAmount,
              discountAmount: l.discountAmount,
              deliveredQuantity: '0.0000',
              taxProfileId: l.taxProfileId ?? undefined,
            })
          );
        }
      } else if (b.warehouseId !== undefined) {
        const dbLines = await manager.find(SalesOrderLine, { where: { salesOrderId: o.id } });
        if (dbLines.length > 0) {
          await assertSalesOrderLinesInStock(
            manager,
            o.warehouseId,
            dbLines.map((l) => ({
              productId: l.productId,
              quantity: stockQtyForLine(parseFloat(l.quantity), l.bonusQuantity ?? '0'),
            }))
          );
        }
      }
      await manager.save(o);
      return manager.findOneOrFail(SalesOrder, {
        where: { id: o.id },
        relations: ['lines', 'lines.product', 'customer', 'warehouse', 'salesperson'],
      });
    });
    const invCountSaved = await Invoice.count({
      where: { salesOrderId: saved.id, deletedAt: IsNull() },
    });
    return ok({
      data: serializeSalesOrder(saved, saved.lines, {
        hasInvoice: invCountSaved > 0,
        lineCount: saved.lines?.length ?? 0,
      }),
    });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, { error: (e as Error).message });
  }
}

export async function confirmSalesOrder(req: Request): Promise<ControllerResult> {
  const o = await SalesOrder.findOne({ where: { id: req.params.id } });
  if (!o) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (o.status === SalesOrderStatus.VOID) {
    throw new HttpError(400, { error: 'Order is void' });
  }
  o.status = SalesOrderStatus.CONFIRMED;
  await SalesOrder.save(o);
  const row = await SalesOrder.findOne({
    where: { id: o.id },
    relations: ['lines', 'lines.product', 'customer', 'warehouse', 'salesperson'],
  });
  const invCount = await Invoice.count({
    where: { salesOrderId: o.id, deletedAt: IsNull() },
  });
  return ok({
    data: serializeSalesOrder(row!, row!.lines, {
      hasInvoice: invCount > 0,
      lineCount: row!.lines?.length ?? 0,
    }),
  });
}

export async function deleteSalesOrder(req: Request): Promise<ControllerResult> {
  const o = await SalesOrder.findOne({ where: { id: req.params.id } });
  if (!o) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (o.status !== SalesOrderStatus.DRAFT) {
    throw new HttpError(400, { error: 'Only draft orders can be deleted' });
  }
  await SalesOrder.delete({ id: o.id });
  return ok({ data: { id: o.id, deleted: true } });
}

export async function convertSalesOrderToInvoice(
  req: Request,
  body: ConvertOrderToInvoiceInput
): Promise<ControllerResult> {
  const b = body;
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
      if (!o) throw new HttpError(404, { error: 'Not found' });
      if (o.status === 'void') throw new HttpError(400, { error: 'Void order cannot invoice' });
      await assertSalesOrderConfirmedForInvoice(manager, o.id);
      await assertNoOtherInvoiceForSalesOrder(manager, o.id);

      const lineInputs: Array<{
        productId: string;
        quantity: number;
        unitPrice: string;
        discountAmount: string;
        taxProfileId?: string;
        salesOrderLineId: string;
      }> = [];

      for (const pl of b.lines) {
        const sol = o.lines?.find((x) => x.id === pl.salesOrderLineId);
        if (!sol) throw new HttpError(400, { error: `Unknown sales order line ${pl.salesOrderLineId}` });
        const qty = pl.quantity;
        if (qty <= 0) throw new HttpError(400, { error: 'Invoice quantity must be positive' });
        const remaining = parseFloat(sol.quantity) - parseFloat(sol.deliveredQuantity) + 1e-9;
        if (qty > remaining)
          throw new HttpError(400, { error: 'Quantity exceeds remaining on sales order line' });
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
      const linesWithBonus: Array<(typeof lineInputs)[number] & { bonusQuantity: string }> = [];
      for (const line of lineInputs) {
        linesWithBonus.push({
          ...line,
          bonusQuantity: await calculateBonus(manager, line.productId, line.quantity),
        });
      }
      const totals = await computeSalesDocumentTotals(
        manager,
        o.customerId,
        linesWithBonus.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          bonusQuantity: l.bonusQuantity,
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
        createdBy: req.auth?.userId,
      });
      await manager.save(invoice);

      for (let i = 0; i < totals.lines.length; i++) {
        const l = totals.lines[i];
        const meta = linesWithBonus[i];
        await manager.save(
          manager.create(InvoiceLine, {
            invoiceId: invoice.id,
            productId: l.productId,
            salesOrderLineId: meta.salesOrderLineId,
            quantity: l.quantity,
            bonusQuantity: meta.bonusQuantity,
            unitPrice: l.unitPrice,
            taxAmount: l.taxAmount,
            discountAmount: l.discountAmount,
            taxProfileId: l.taxProfileId ?? undefined,
          })
        );
      }

      return manager.findOneOrFail(Invoice, { where: { id: invoice.id }, relations: ['lines'] });
    });

    return created({
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
          bonusQuantity: l.bonusQuantity,
          unitPrice: l.unitPrice,
          taxAmount: l.taxAmount,
          discountAmount: l.discountAmount,
        })),
      },
    });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, { error: (e as Error).message });
  }
}
