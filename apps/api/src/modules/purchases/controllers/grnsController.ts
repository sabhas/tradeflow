import type { Request } from 'express';
import type { z } from 'zod';
import {
  Grn,
  GrnLine,
  Product,
  PurchaseOrder,
  PurchaseOrderLine,
  SupplierInvoice,
  SupplierInvoiceLine,
} from '@tradeflow/db';
import { createGrnSchema, updateGrnSchema } from '@tradeflow/shared';
import { getPagination } from '../../../shared/utils/pagination';
import {
  applyMovement,
  assertProductInScope,
  assertWarehouseInScope,
  runInTransaction,
} from '../../inventory/services/inventoryService';
import { parseDecimalStrict } from '../../../shared/utils/decimal';
import { assertDateNotPeriodLocked } from '../../accounting/services/periodLock';
import { postGrnJournal } from '../../accounting/services/accountingPosting';
import { enforceProductBatchControls } from '../../inventory/services/productBatchControls';
import { computePurchaseDocumentTotals } from '../services/purchaseTotals';
import { resolveSupplierDueDate } from '../services/supplierDueDateService';
import { validateGrnAgainstPurchaseOrder } from '../services/grnPoValidation';
import { GrnStatus, SupplierInvoiceStatus } from '@tradeflow/shared';
import { handleControllerError } from '../../../shared/utils/mapDbError';
import {
  loadLinkedInvoicesByGrnIds,
  settlementFields,
  type LinkedSupplierInvoice,
  assertGrnLinkableToInvoice,
} from '../services/grnInvoiceSettlement';
import { moneyAdd } from '../../../shared/utils/money';
import { created, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';

type CreateGrnInput = z.infer<typeof createGrnSchema>;
type UpdateGrnInput = z.infer<typeof updateGrnSchema>;

function serializeGrn(g: Grn, lines?: GrnLine[], linked?: LinkedSupplierInvoice | null) {
  return {
    id: g.id,
    purchaseOrderId: g.purchaseOrderId ?? null,
    supplierId: g.supplierId,
    grnDate: g.grnDate,
    warehouseId: g.warehouseId,
    status: g.status,
    createdBy: g.createdBy ?? null,
    createdAt: g.createdAt,
    ...settlementFields(g.status, linked),
    supplier: g.supplier ? { id: g.supplier.id, name: g.supplier.name } : undefined,
    warehouse: g.warehouse ? { id: g.warehouse.id, name: g.warehouse.name } : undefined,
    lines:
      lines?.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        bonusQuantity: l.bonusQuantity ?? '0',
        unitPrice: l.unitPrice,
        tradePrice: l.tradePrice ?? null,
        retailPrice: l.retailPrice ?? null,
        purchaseOrderLineId: l.purchaseOrderLineId ?? null,
        batchCode: l.batchCode ?? null,
        expiryDate: l.expiryDate ? String(l.expiryDate).slice(0, 10) : null,
      })) ?? undefined,
  };
}

function applyInvoiceSettlementFilter(
  qb: ReturnType<typeof Grn.createQueryBuilder>,
  settlement: string
): void {
  if (settlement === 'awaiting_invoice') {
    qb.andWhere(`g.status = 'posted'`).andWhere(
      `NOT EXISTS (SELECT 1 FROM supplier_invoices si WHERE si.grn_id = g.id)`
    );
  } else if (settlement === 'invoice_draft') {
    qb.andWhere(`g.status = 'posted'`).andWhere(
      `EXISTS (SELECT 1 FROM supplier_invoices si WHERE si.grn_id = g.id AND si.status = 'draft')`
    );
  } else if (settlement === 'invoice_posted') {
    qb.andWhere(`g.status = 'posted'`).andWhere(
      `EXISTS (SELECT 1 FROM supplier_invoices si WHERE si.grn_id = g.id AND si.status = 'posted')`
    );
  }
}

export async function listGrns(req: Request): Promise<ControllerResult> {
  const { limit, offset } = getPagination(req);
  const qb = Grn.createQueryBuilder('g')
    .leftJoinAndSelect('g.supplier', 's')
    .leftJoinAndSelect('g.warehouse', 'w')
    .where('1=1');
  if (req.query.supplierId) qb.andWhere('g.supplierId = :sid', { sid: req.query.supplierId });
  if (req.query.status) qb.andWhere('g.status = :st', { st: req.query.status });
  const invoiceSettlement = (req.query.invoiceSettlement as string | undefined)?.trim();
  if (invoiceSettlement) applyInvoiceSettlementFilter(qb, invoiceSettlement);
  qb.orderBy('g.grnDate', 'DESC').addOrderBy('g.createdAt', 'DESC').take(limit).skip(offset);
  const [rows, total] = await qb.getManyAndCount();
  const linkedMap = await loadLinkedInvoicesByGrnIds(rows.map((r) => r.id));
  return ok({
    data: rows.map((r) => serializeGrn(r, undefined, linkedMap.get(r.id))),
    meta: { total, limit, offset },
  });
}

export async function pendingInvoiceCount(_req: Request): Promise<ControllerResult> {
  const row = await Grn.createQueryBuilder('g')
    .select('COUNT(*)', 'count')
    .where(`g.status = 'posted'`)
    .andWhere(
      `(
        NOT EXISTS (SELECT 1 FROM supplier_invoices si WHERE si.grn_id = g.id)
        OR EXISTS (SELECT 1 FROM supplier_invoices si WHERE si.grn_id = g.id AND si.status = 'draft')
      )`
    )
    .getRawOne<{ count: string }>();
  return ok({ data: { count: Number(row?.count ?? 0) } });
}

export async function getGrn(req: Request): Promise<ControllerResult> {
  const g = await Grn.findOne({
    where: { id: req.params.id },
    relations: ['lines', 'supplier', 'warehouse'],
  });
  if (!g) {
    throw new HttpError(404, { error: 'Not found' });
  }
  const linkedMap = await loadLinkedInvoicesByGrnIds([g.id]);
  return ok({ data: serializeGrn(g, g.lines, linkedMap.get(g.id)) });
}

export async function createSupplierInvoiceDraftFromGrn(req: Request): Promise<ControllerResult> {
  const userId = req.auth?.userId;
  try {
    const result = await runInTransaction(async (manager) => {
      const grn = await manager.findOne(Grn, {
        where: { id: req.params.id },
        relations: ['lines'],
      });
      if (!grn) throw new Error('Not found');
      await assertGrnLinkableToInvoice(manager, grn.id, grn.supplierId);

      const grnLines = grn.lines ?? [];
      if (grnLines.length === 0) throw new Error('GRN has no lines');

      const invoiceDate = new Date().toISOString().slice(0, 10);
      const dueDate = await resolveSupplierDueDate(manager, grn.supplierId, invoiceDate);
      const placeholderNumber = `PENDING-${grn.id.slice(0, 8).toUpperCase()}`;

      const totals = await computePurchaseDocumentTotals(
        manager,
        grn.supplierId,
        grnLines.map((l) => ({
          productId: l.productId,
          quantity: parseFloat(l.quantity),
          unitPrice: l.unitPrice,
          discountAmount: '0',
          taxProfileId: undefined,
        })),
        '0'
      );

      const inv = manager.create(SupplierInvoice, {
        supplierId: grn.supplierId,
        invoiceNumber: placeholderNumber,
        invoiceDate,
        dueDate,
        purchaseOrderId: grn.purchaseOrderId ?? undefined,
        grnId: grn.id,
        status: SupplierInvoiceStatus.DRAFT,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discountAmount: totals.discountAmount,
        total: totals.total,
        notes: `Draft from GRN ${grn.id.slice(0, 8)} — replace invoice number before posting`,
        createdBy: userId,
      });
      await manager.save(inv);

      for (let i = 0; i < totals.lines.length; i++) {
        const cmp = totals.lines[i];
        const gl = grnLines[i];
        await manager.save(
          manager.create(SupplierInvoiceLine, {
            supplierInvoiceId: inv.id,
            productId: cmp.productId,
            quantity: parseDecimalStrict(String(gl.quantity)),
            bonusQuantity: gl.bonusQuantity ?? '0.0000',
            unitPrice: parseDecimalStrict(String(gl.unitPrice)),
            taxAmount: cmp.taxAmount,
            discountAmount: cmp.discountAmount,
            grnLineId: gl.id,
          })
        );
      }

      return { supplierInvoiceId: inv.id };
    });
    return created({ data: result });
  } catch (e) {
    handleControllerError(e, 'Create draft failed');
  }
}

export async function createGrn(req: Request, body: CreateGrnInput): Promise<ControllerResult> {
  const b = body;
  const userId = req.auth?.userId;
  try {
    await assertWarehouseInScope(b.warehouseId, undefined);
    for (const line of b.lines) {
      await assertProductInScope(line.productId, undefined);
    }
  } catch (e) {
    throw new HttpError(400, { error: e instanceof Error ? e.message : 'Bad request' });
  }

  try {
    const row = await runInTransaction(async (manager) => {
      const purchaseOrderId: string | undefined = b.purchaseOrderId ?? undefined;
      if (purchaseOrderId) {
        await validateGrnAgainstPurchaseOrder(manager, {
          purchaseOrderId,
          supplierId: b.supplierId,
          warehouseId: b.warehouseId,
          lines: b.lines,
        });
      }
      await enforceProductBatchControls(manager, b.lines);

      const grn = manager.create(Grn, {
        purchaseOrderId: purchaseOrderId ?? undefined,
        supplierId: b.supplierId,
        grnDate: b.grnDate.slice(0, 10),
        warehouseId: b.warehouseId,
        status: GrnStatus.DRAFT,
        createdBy: userId,
      });
      await manager.save(grn);

      for (const ln of b.lines) {
        let unitPriceStr = '0.0000';
        if (ln.purchaseOrderLineId) {
          const pol = await manager.findOne(PurchaseOrderLine, { where: { id: ln.purchaseOrderLineId } });
          if (!pol) throw new Error('Purchase order line not found');
          unitPriceStr = pol.unitPrice;
        }
        if (ln.unitPrice != null && ln.unitPrice !== '') unitPriceStr = String(ln.unitPrice);
        const bonusQty =
          ln.bonusQuantity != null && ln.bonusQuantity !== ''
            ? parseDecimalStrict(String(ln.bonusQuantity))
            : '0.0000';
        await manager.save(
          manager.create(GrnLine, {
            grnId: grn.id,
            productId: ln.productId,
            quantity: parseDecimalStrict(String(ln.quantity)),
            bonusQuantity: bonusQty,
            unitPrice: parseDecimalStrict(unitPriceStr),
            tradePrice:
              ln.tradePrice != null && ln.tradePrice !== ''
                ? parseDecimalStrict(String(ln.tradePrice))
                : undefined,
            retailPrice:
              ln.retailPrice != null && ln.retailPrice !== ''
                ? parseDecimalStrict(String(ln.retailPrice))
                : undefined,
            purchaseOrderLineId: ln.purchaseOrderLineId ?? undefined,
            batchCode: ln.batchCode?.trim() || undefined,
            expiryDate: ln.expiryDate?.trim() ? ln.expiryDate.slice(0, 10) : undefined,
          })
        );
      }

      return manager.findOneOrFail(Grn, {
        where: { id: grn.id },
        relations: ['lines', 'supplier', 'warehouse'],
      });
    });
    const linkedMap = await loadLinkedInvoicesByGrnIds([row.id]);
    return created({ data: serializeGrn(row, row.lines, linkedMap.get(row.id)) });
  } catch (e) {
    handleControllerError(e, 'Failed to create GRN');
  }
}

export async function updateGrn(req: Request, body: UpdateGrnInput): Promise<ControllerResult> {
  try {
    const row = await runInTransaction(async (manager) => {
      const grn = await manager.findOne(Grn, {
        where: { id: req.params.id },
        relations: ['lines'],
      });
      if (!grn) throw new Error('Not found');
      if (grn.status !== GrnStatus.DRAFT)
        throw new HttpError(400, { error: 'Only draft GRNs can be edited' });

      const supplierId = body.supplierId ?? grn.supplierId;
      const warehouseId = body.warehouseId ?? grn.warehouseId;
      const grnDate = body.grnDate !== undefined ? body.grnDate.slice(0, 10) : grn.grnDate;
      const purchaseOrderId =
        body.purchaseOrderId !== undefined ? (body.purchaseOrderId ?? undefined) : grn.purchaseOrderId;

      try {
        await assertWarehouseInScope(warehouseId, undefined);
        if (body.lines) {
          for (const line of body.lines) {
            await assertProductInScope(line.productId, undefined);
          }
        }
      } catch (e) {
        throw new Error(e instanceof Error ? e.message : 'Bad request');
      }

      if (purchaseOrderId && body.lines) {
        await validateGrnAgainstPurchaseOrder(manager, {
          purchaseOrderId,
          supplierId,
          warehouseId,
          lines: body.lines,
        });
      }

      grn.supplierId = supplierId;
      grn.warehouseId = warehouseId;
      grn.grnDate = grnDate;
      grn.purchaseOrderId = purchaseOrderId;
      await manager.save(grn);

      if (body.lines) {
        await enforceProductBatchControls(manager, body.lines);
        await manager.delete(GrnLine, { grnId: grn.id });
        for (const ln of body.lines) {
          let unitPriceStr = '0.0000';
          if (ln.purchaseOrderLineId) {
            const pol = await manager.findOne(PurchaseOrderLine, { where: { id: ln.purchaseOrderLineId } });
            if (!pol) throw new Error('Purchase order line not found');
            unitPriceStr = pol.unitPrice;
          }
          if (ln.unitPrice != null && ln.unitPrice !== '') unitPriceStr = String(ln.unitPrice);
          const bonusQty =
            ln.bonusQuantity != null && ln.bonusQuantity !== ''
              ? parseDecimalStrict(String(ln.bonusQuantity))
              : '0.0000';
          await manager.save(
            manager.create(GrnLine, {
              grnId: grn.id,
              productId: ln.productId,
              quantity: parseDecimalStrict(String(ln.quantity)),
              bonusQuantity: bonusQty,
              unitPrice: parseDecimalStrict(unitPriceStr),
              tradePrice:
                ln.tradePrice != null && ln.tradePrice !== ''
                  ? parseDecimalStrict(String(ln.tradePrice))
                  : undefined,
              retailPrice:
                ln.retailPrice != null && ln.retailPrice !== ''
                  ? parseDecimalStrict(String(ln.retailPrice))
                  : undefined,
              purchaseOrderLineId: ln.purchaseOrderLineId ?? undefined,
              batchCode: ln.batchCode?.trim() || undefined,
              expiryDate: ln.expiryDate?.trim() ? ln.expiryDate.slice(0, 10) : undefined,
            })
          );
        }
      }

      return manager.findOneOrFail(Grn, {
        where: { id: grn.id },
        relations: ['lines', 'supplier', 'warehouse'],
      });
    });
    const linkedMap = await loadLinkedInvoicesByGrnIds([row.id]);
    return ok({ data: serializeGrn(row, row.lines, linkedMap.get(row.id)) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to update GRN';
    if (msg === 'Not found') throw new HttpError(404, { error: msg });
    throw new HttpError(400, { error: msg });
  }
}

export async function postGrn(req: Request): Promise<ControllerResult> {
  try {
    const row = await runInTransaction(async (manager) => {
      const grn = await manager.findOne(Grn, {
        where: { id: req.params.id },
        relations: ['lines'],
      });
      if (!grn) throw new Error('Not found');
      if (grn.status !== GrnStatus.DRAFT)
        throw new HttpError(400, { error: 'Only draft GRNs can be posted' });
      await assertDateNotPeriodLocked(manager, grn.grnDate);
      await enforceProductBatchControls(manager, grn.lines ?? []);

      for (const line of grn.lines ?? []) {
        await assertProductInScope(line.productId, undefined);
        await assertWarehouseInScope(grn.warehouseId, undefined);
        const product = await manager.findOne(Product, { where: { id: line.productId } });
        if (!product) throw new Error('Product not found');
        const paidQty = parseFloat(line.quantity);
        const bonusQty = parseFloat(line.bonusQuantity ?? '0');
        const totalQty = paidQty + bonusQty;
        const stockDelta = parseDecimalStrict(totalQty.toFixed(4));
        const unitCost =
          totalQty > 0
            ? parseDecimalStrict(((paidQty * parseFloat(line.unitPrice)) / totalQty).toFixed(4))
            : line.unitPrice;
        await applyMovement(manager, {
          productId: line.productId,
          warehouseId: grn.warehouseId,
          quantityDelta: stockDelta,
          refType: 'purchase',
          refId: grn.id,
          unitCost,
          movementDate: grn.grnDate,
          userId: req.auth?.userId,
          grnLineId: line.id,
          tradePrice: line.tradePrice ?? product.sellingPrice,
          retailPrice: line.retailPrice ?? product.retailPrice,
          batchCode: line.batchCode,
          expiryDate: line.expiryDate ? String(line.expiryDate).slice(0, 10) : undefined,
        });
        if (product.tradePriceAllBatches && line.tradePrice != null && line.tradePrice !== '') {
          await manager.query(
            `
            UPDATE stock_layers
            SET trade_price = $1::numeric
            WHERE product_id = $2
              AND warehouse_id = $3
              AND quantity_remaining::numeric > 0.00001
            `,
            [parseDecimalStrict(String(line.tradePrice)), line.productId, grn.warehouseId]
          );
        }

        if (line.purchaseOrderLineId) {
          const pol = await manager.findOne(PurchaseOrderLine, { where: { id: line.purchaseOrderLineId } });
          if (pol) {
            const newRec = (parseFloat(pol.receivedQuantity) + paidQty).toFixed(4);
            pol.receivedQuantity = newRec;
            await manager.save(pol);
          }
        }
      }

      let grnTotal = '0.0000';
      for (const line of grn.lines ?? []) {
        const lineAmount = (parseFloat(line.quantity) * parseFloat(line.unitPrice)).toFixed(4);
        grnTotal = moneyAdd(grnTotal, lineAmount);
      }
      if (parseFloat(grnTotal) > 0.00005) {
        await postGrnJournal(manager, {
          entryDate: grn.grnDate,
          reference: `GRN-${grn.id.slice(0, 8)}`,
          description: `GRN stock posting ${grn.id.slice(0, 8)}`,
          userId: req.auth?.userId,
          grnId: grn.id,
          total: grnTotal,
        });
      }

      grn.status = 'posted';
      await manager.save(grn);

      if (grn.purchaseOrderId) {
        const po = await manager.findOne(PurchaseOrder, {
          where: { id: grn.purchaseOrderId },
          relations: ['lines'],
        });
        if (po?.lines?.length) {
          const allReceived = po.lines.every(
            (l) => parseFloat(l.receivedQuantity) + 0.0001 >= parseFloat(l.quantity)
          );
          if (allReceived) {
            po.status = 'closed';
            await manager.save(po);
          }
        }
      }

      return manager.findOneOrFail(Grn, {
        where: { id: grn.id },
        relations: ['lines', 'supplier', 'warehouse'],
      });
    });
    const linkedMap = await loadLinkedInvoicesByGrnIds([row.id]);
    return ok({ data: serializeGrn(row, row.lines, linkedMap.get(row.id)) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Post failed';
    if (msg === 'Not found') {
      throw new HttpError(404, { error: msg });
    }
    throw new HttpError(400, { error: msg });
  }
}
