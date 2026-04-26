import type { Request } from 'express';
import type { z } from 'zod';
import { Grn, GrnLine, Product, PurchaseOrder, PurchaseOrderLine } from '@tradeflow/db';
import { createGrnSchema } from '@tradeflow/shared';
import { In, type EntityManager } from 'typeorm';
import { getPagination } from '../utils/pagination';
import {
  applyMovement,
  assertProductInScope,
  assertWarehouseInScope,
  runInTransaction,
} from '../services/inventoryService';
import { parseDecimalStrict } from '../utils/decimal';
import { assertDateNotPeriodLocked } from '../services/periodLock';
import { postGrnJournal } from '../services/accountingPosting';
import { moneyAdd } from '../utils/money';
import { created, ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

type CreateGrnInput = z.infer<typeof createGrnSchema>;

async function enforceProductBatchControls(
  manager: EntityManager,
  lines: Array<{ productId: string; batchCode?: string | null; expiryDate?: string | null }>
) {
  const productIds = [...new Set(lines.map((line) => line.productId))];
  if (productIds.length === 0) return;

  const products = await manager.find(Product, {
    where: { id: In(productIds) },
  });
  const productsById = new Map(products.map((product) => [product.id, product]));

  for (const line of lines) {
    const product = productsById.get(line.productId);
    if (!product) {
      throw new Error(`Product not found: ${line.productId}`);
    }

    const batchCode = line.batchCode?.trim() ?? '';
    if (product.batchTracked && !batchCode) {
      throw new Error(`Batch code is required for batch-tracked product "${product.name}"`);
    }

    const expiryDate = line.expiryDate?.trim() ?? '';
    if (product.expiryTracked && !expiryDate) {
      throw new Error(`Expiry date is required for expiry-tracked product "${product.name}"`);
    }
  }
}

function serializeGrn(g: Grn, lines?: GrnLine[]) {
  return {
    id: g.id,
    purchaseOrderId: g.purchaseOrderId ?? null,
    supplierId: g.supplierId,
    grnDate: g.grnDate,
    warehouseId: g.warehouseId,
    status: g.status,
    createdBy: g.createdBy ?? null,
    createdAt: g.createdAt,
    supplier: g.supplier ? { id: g.supplier.id, name: g.supplier.name } : undefined,
    warehouse: g.warehouse ? { id: g.warehouse.id, name: g.warehouse.name } : undefined,
    lines:
      lines?.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        tradePrice: l.tradePrice ?? null,
        retailPrice: l.retailPrice ?? null,
        purchaseOrderLineId: l.purchaseOrderLineId ?? null,
        batchCode: l.batchCode ?? null,
        expiryDate: l.expiryDate ? String(l.expiryDate).slice(0, 10) : null,
      })) ?? undefined,
  };
}

export async function listGrns(req: Request): Promise<ControllerResult> {
  const { limit, offset } = getPagination(req);
  const qb = Grn
    .createQueryBuilder('g')
    .leftJoinAndSelect('g.supplier', 's')
    .leftJoinAndSelect('g.warehouse', 'w')
    .where('1=1');
  if (req.query.supplierId) qb.andWhere('g.supplierId = :sid', { sid: req.query.supplierId });
  if (req.query.status) qb.andWhere('g.status = :st', { st: req.query.status });
  qb.orderBy('g.grnDate', 'DESC').addOrderBy('g.createdAt', 'DESC').take(limit).skip(offset);
  const [rows, total] = await qb.getManyAndCount();
  return ok({ data: rows.map((r) => serializeGrn(r)), meta: { total, limit, offset } });
}

export async function getGrn(req: Request): Promise<ControllerResult> {
  const g = await Grn.findOne({
    where: { id: req.params.id },
    relations: ['lines', 'supplier', 'warehouse'],
  });
  if (!g) {
    throw new HttpError(404, { error: 'Not found' });
  }
  return ok({ data: serializeGrn(g, g.lines) });
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
      let purchaseOrderId: string | undefined = b.purchaseOrderId ?? undefined;
      if (purchaseOrderId) {
        const po = await manager.findOne(PurchaseOrder, {
          where: { id: purchaseOrderId },
          relations: ['lines'],
        });
        if (!po) throw new Error('Purchase order not found');
        if (po.supplierId !== b.supplierId) throw new Error('Supplier must match purchase order');
        if (po.warehouseId !== b.warehouseId) throw new Error('Warehouse must match purchase order');
        for (const ln of b.lines) {
          if (!ln.purchaseOrderLineId) continue;
          const pol = po.lines?.find((p) => p.id === ln.purchaseOrderLineId);
          if (!pol) throw new Error('Invalid purchase order line');
          if (pol.productId !== ln.productId) throw new Error('Product does not match PO line');
          const rem = parseFloat(pol.quantity) - parseFloat(pol.receivedQuantity);
          const q = parseFloat(String(ln.quantity));
          if (q > rem + 0.0001) throw new Error('Receive quantity exceeds open PO quantity');
        }
      }
      await enforceProductBatchControls(manager, b.lines);

      const grn = manager.create(Grn, {
        purchaseOrderId: purchaseOrderId ?? undefined,
        supplierId: b.supplierId,
        grnDate: b.grnDate.slice(0, 10),
        warehouseId: b.warehouseId,
        status: 'draft',
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
        await manager.save(
          manager.create(GrnLine, {
            grnId: grn.id,
            productId: ln.productId,
            quantity: parseDecimalStrict(String(ln.quantity)),
            unitPrice: parseDecimalStrict(unitPriceStr),
            tradePrice: ln.tradePrice != null && ln.tradePrice !== '' ? parseDecimalStrict(String(ln.tradePrice)) : undefined,
            retailPrice:
              ln.retailPrice != null && ln.retailPrice !== '' ? parseDecimalStrict(String(ln.retailPrice)) : undefined,
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
    return created({ data: serializeGrn(row, row.lines) });
  } catch (e) {
    throw new HttpError(400, { error: e instanceof Error ? e.message : 'Failed to create GRN' });
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
      if (grn.status !== 'draft') throw new Error('Only draft GRNs can be posted');
      await assertDateNotPeriodLocked(manager, grn.grnDate);
      await enforceProductBatchControls(manager, grn.lines ?? []);

      for (const line of grn.lines ?? []) {
        await assertProductInScope(line.productId, undefined);
        await assertWarehouseInScope(grn.warehouseId, undefined);
        const product = await manager.findOne(Product, { where: { id: line.productId } });
        if (!product) throw new Error('Product not found');
        const qty = parseDecimalStrict(line.quantity);
        await applyMovement(manager, {
          productId: line.productId,
          warehouseId: grn.warehouseId,
          quantityDelta: qty,
          refType: 'purchase',
          refId: grn.id,
          unitCost: line.unitPrice,
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
            const newRec = (parseFloat(pol.receivedQuantity) + parseFloat(qty)).toFixed(4);
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
    return ok({ data: serializeGrn(row, row.lines) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Post failed';
    if (msg === 'Not found') {
      throw new HttpError(404, { error: msg });
    }
    throw new HttpError(400, { error: msg });
  }
}
