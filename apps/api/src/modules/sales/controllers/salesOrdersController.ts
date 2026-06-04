import type { Request } from 'express';
import { IsNull } from 'typeorm';
import type { z } from 'zod';
import { Product, SalesOrder, SalesOrderLine, Invoice } from '@tradeflow/db';
import {
  bulkSalesOrdersSchema,
  createSalesOrderSchema,
  convertOrderToInvoiceSchema,
  updateSalesOrderSchema,
  SalesOrderStatus,
} from '@tradeflow/shared';
import { getPagination } from '../../../shared/utils/pagination';
import * as salesOrderService from '../services/salesOrderService';
import { created, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';

type CreateSalesOrderInput = z.infer<typeof createSalesOrderSchema>;
type UpdateSalesOrderInput = z.infer<typeof updateSalesOrderSchema>;
type ConvertOrderToInvoiceInput = z.infer<typeof convertOrderToInvoiceSchema>;
type BulkSalesOrdersInput = z.infer<typeof bulkSalesOrdersSchema>;

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
  const results = await salesOrderService.bulkSalesOrders(body);
  return ok({ data: { results } });
}

export async function createSalesOrder(req: Request, body: CreateSalesOrderInput): Promise<ControllerResult> {
  const saved = await salesOrderService.createSalesOrder(body, req.auth?.userId);
  return created({
    data: serializeSalesOrder(saved, saved.lines, {
      hasInvoice: false,
      lineCount: saved.lines?.length ?? 0,
    }),
  });
}

export async function updateSalesOrder(req: Request, body: UpdateSalesOrderInput): Promise<ControllerResult> {
  const saved = await salesOrderService.updateSalesOrder(req.params.id, body);
  const invCountSaved = await Invoice.count({
    where: { salesOrderId: saved.id, deletedAt: IsNull() },
  });
  return ok({
    data: serializeSalesOrder(saved, saved.lines, {
      hasInvoice: invCountSaved > 0,
      lineCount: saved.lines?.length ?? 0,
    }),
  });
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
  const inv = await salesOrderService.convertSalesOrderToInvoice(req.params.id, body, req.auth?.userId);

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
}
