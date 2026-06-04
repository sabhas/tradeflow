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
import { createGrnSchema, updateGrnSchema, GrnStatus, SupplierInvoiceStatus } from '@tradeflow/shared';
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
import { computePurchaseDocumentTotals } from './purchaseTotals';
import { resolveSupplierDueDate } from './supplierDueDateService';
import { validateGrnAgainstPurchaseOrder } from './grnPoValidation';
import { assertGrnLinkableToInvoice } from './grnInvoiceSettlement';
import { moneyAdd } from '../../../shared/utils/money';
import { HttpError } from '../../../shared/utils/httpError';

type CreateGrnInput = z.infer<typeof createGrnSchema>;
type UpdateGrnInput = z.infer<typeof updateGrnSchema>;

export function applyInvoiceSettlementFilter(
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

export async function createGrn(body: CreateGrnInput, userId?: string): Promise<Grn> {
  await assertWarehouseInScope(body.warehouseId, undefined);
  for (const line of body.lines) {
    await assertProductInScope(line.productId, undefined);
  }

  return runInTransaction(async (manager) => {
    const purchaseOrderId: string | undefined = body.purchaseOrderId ?? undefined;
    if (purchaseOrderId) {
      await validateGrnAgainstPurchaseOrder(manager, {
        purchaseOrderId,
        supplierId: body.supplierId,
        warehouseId: body.warehouseId,
        lines: body.lines,
      });
    }
    await enforceProductBatchControls(manager, body.lines);

    const grn = manager.create(Grn, {
      purchaseOrderId: purchaseOrderId ?? undefined,
      supplierId: body.supplierId,
      grnDate: body.grnDate.slice(0, 10),
      warehouseId: body.warehouseId,
      status: GrnStatus.DRAFT,
      createdBy: userId,
    });
    await manager.save(grn);

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

    return manager.findOneOrFail(Grn, {
      where: { id: grn.id },
      relations: ['lines', 'supplier', 'warehouse'],
    });
  });
}

export async function updateGrn(id: string, body: UpdateGrnInput): Promise<Grn> {
  return runInTransaction(async (manager) => {
    const grn = await manager.findOne(Grn, {
      where: { id },
      relations: ['lines'],
    });
    if (!grn) throw new Error('Not found');
    if (grn.status !== GrnStatus.DRAFT) throw new HttpError(400, { error: 'Only draft GRNs can be edited' });

    const supplierId = body.supplierId ?? grn.supplierId;
    const warehouseId = body.warehouseId ?? grn.warehouseId;
    const grnDate = body.grnDate !== undefined ? body.grnDate.slice(0, 10) : grn.grnDate;
    const purchaseOrderId =
      body.purchaseOrderId !== undefined ? (body.purchaseOrderId ?? undefined) : grn.purchaseOrderId;

    await assertWarehouseInScope(warehouseId, undefined);
    if (body.lines) {
      for (const line of body.lines) {
        await assertProductInScope(line.productId, undefined);
      }
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
}

export async function postGrn(id: string, userId?: string): Promise<Grn> {
  return runInTransaction(async (manager) => {
    const grn = await manager.findOne(Grn, {
      where: { id },
      relations: ['lines'],
    });
    if (!grn) throw new Error('Not found');
    if (grn.status !== GrnStatus.DRAFT) throw new HttpError(400, { error: 'Only draft GRNs can be posted' });
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
        userId,
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
        userId,
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
}

export async function createSupplierInvoiceDraftFromGrn(
  grnId: string,
  userId?: string
): Promise<{ supplierInvoiceId: string }> {
  return runInTransaction(async (manager) => {
    const grn = await manager.findOne(Grn, {
      where: { id: grnId },
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
}
