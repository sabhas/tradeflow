import type { EntityManager } from 'typeorm';
import { IsNull } from 'typeorm';
import type { z } from 'zod';
import { SalesOrder, SalesOrderLine, Invoice, InvoiceLine, Product } from '@tradeflow/db';
import {
  bulkSalesOrdersSchema,
  createSalesOrderSchema,
  convertOrderToInvoiceSchema,
  updateSalesOrderSchema,
  SalesOrderStatus,
} from '@tradeflow/shared';
import { HttpError } from '../../../shared/utils/httpError';
import { computeSalesDocumentTotals } from './salesTotals';
import { runInTransaction } from '../../inventory/services/inventoryService';
import { resolveInvoiceDueDate } from './invoicePosting';
import {
  assertNoOtherInvoiceForSalesOrder,
  assertSalesOrderConfirmedForInvoice,
} from './salesOrderInvoiceGuard';
import { assertSalesOrderLinesInStock } from './salesOrderStockValidation';
import { calculateBonus, calculateBonusBatch } from './bonusService';

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

export async function bulkSalesOrders(
  body: BulkSalesOrdersInput
): Promise<Array<{ id: string; ok: boolean; error?: string }>> {
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

  return results;
}

export async function createSalesOrder(
  body: CreateSalesOrderInput,
  userId?: string
): Promise<SalesOrder & { lines: Array<SalesOrderLine & { product?: Product }> }> {
  const b = body;
  return runInTransaction(async (manager) => {
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
      createdBy: userId,
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
}

export async function updateSalesOrder(
  id: string,
  body: UpdateSalesOrderInput
): Promise<SalesOrder & { lines: Array<SalesOrderLine & { product?: Product }> }> {
  const b = body;
  return runInTransaction(async (manager) => {
    const o = await manager.findOne(SalesOrder, {
      where: { id },
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
}

export async function convertSalesOrderToInvoice(
  orderId: string,
  body: ConvertOrderToInvoiceInput,
  userId?: string
): Promise<Invoice & { lines: InvoiceLine[] }> {
  const b = body;
  const warehouseId = b.warehouseId;
  const paymentType = b.paymentType ?? 'credit';
  const invoiceDate = b.invoiceDate?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const dueDateBody = b.dueDate;

  return runInTransaction(async (manager) => {
    const o = await manager.findOne(SalesOrder, {
      where: { id: orderId },
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
      createdBy: userId,
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
}
