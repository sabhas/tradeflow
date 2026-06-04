import type { Request } from 'express';
import { IsNull } from 'typeorm';
import type { z } from 'zod';
import { SalesOrder, SalesOrderLine, Invoice } from '@tradeflow/db';
import {
  bulkSalesOrdersSchema,
  createSalesOrderSchema,
  convertOrderToInvoiceSchema,
  updateSalesOrderSchema,
  listSalesOrdersQuerySchema,
  SalesOrderStatus,
} from '@tradeflow/shared';
import { getValidatedQuery } from '../../../shared/middleware/validate';
import { getPaginationFromQuery } from '../../../shared/utils/pagination';
import * as salesOrderService from '../services/salesOrderService';
import { created, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';
import { serializeSalesOrder } from '../serializers/salesOrder.serializer';

type CreateSalesOrderInput = z.infer<typeof createSalesOrderSchema>;
type UpdateSalesOrderInput = z.infer<typeof updateSalesOrderSchema>;
type ConvertOrderToInvoiceInput = z.infer<typeof convertOrderToInvoiceSchema>;
type BulkSalesOrdersInput = z.infer<typeof bulkSalesOrdersSchema>;

type ListSalesOrdersQuery = z.infer<typeof listSalesOrdersQuerySchema>;

export async function listSalesOrders(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<ListSalesOrdersQuery>(req);
  const { limit, offset } = getPaginationFromQuery(q);
  const qb = SalesOrder.createQueryBuilder('o')
    .leftJoinAndSelect('o.customer', 'customer')
    .leftJoinAndSelect('o.warehouse', 'warehouse')
    .leftJoinAndSelect('o.salesperson', 'salesperson')
    .orderBy('o.orderDate', 'DESC')
    .addOrderBy('o.createdAt', 'DESC')
    .take(limit)
    .skip(offset);

  if (q.customerId) {
    qb.andWhere('o.customerId = :cid', { cid: q.customerId });
  }
  if (q.status) {
    qb.andWhere('o.status = :st', { st: q.status });
  }
  if (q.dateFrom) {
    qb.andWhere('o.orderDate >= :df', { df: q.dateFrom });
  }
  if (q.dateTo) {
    qb.andWhere('o.orderDate <= :dt', { dt: q.dateTo });
  }
  if (q.warehouseId) {
    qb.andWhere('o.warehouseId = :wid', { wid: q.warehouseId });
  }
  const search = q.q?.trim() ?? '';
  if (search) {
    qb.andWhere('(customer.name ILIKE :search OR customer.longName ILIKE :search)', {
      search: `%${search}%`,
    });
  }
  if (q.hasInvoice === 'true') {
    qb.andWhere(`EXISTS (SELECT 1 FROM invoices i WHERE i.sales_order_id = o.id AND i.deleted_at IS NULL)`);
  } else if (q.hasInvoice === 'false') {
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
