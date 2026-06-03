import type { Request } from 'express';
import type { EntityManager } from 'typeorm';
import type { z } from 'zod';
import { Grn, PurchaseReturn, PurchaseReturnLine } from '@tradeflow/db';
import { createPurchaseReturnSchema, updatePurchaseReturnSchema } from '@tradeflow/shared';
import { getPagination } from '../../../shared/utils/pagination';
import { computePurchaseDocumentTotals } from '../services/purchaseTotals';
import {
  applyMovement,
  assertProductInScope,
  assertWarehouseInScope,
  runInTransaction,
} from '../../inventory/services/inventoryService';
import { postPurchaseReturnJournal } from '../../accounting/services/accountingPosting';
import { assertDateNotPeriodLocked } from '../../accounting/services/periodLock';
import { parseDecimalStrict } from '../../../shared/utils/decimal';
import { moneySub } from '../../../shared/utils/money';
import { created, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';

type CreatePurchaseReturnInput = z.infer<typeof createPurchaseReturnSchema>;
type UpdatePurchaseReturnInput = z.infer<typeof updatePurchaseReturnSchema>;

function serialize(row: PurchaseReturn, lines?: PurchaseReturnLine[]) {
  return {
    id: row.id,
    supplierId: row.supplierId,
    returnDate: row.returnDate,
    warehouseId: row.warehouseId,
    status: row.status,
    subtotal: row.subtotal,
    taxAmount: row.taxAmount,
    discountAmount: row.discountAmount,
    total: row.total,
    notes: row.notes ?? null,
    grnId: row.grnId ?? null,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt,
    supplier: row.supplier ? { id: row.supplier.id, name: row.supplier.name } : undefined,
    warehouse: row.warehouse ? { id: row.warehouse.id, name: row.warehouse.name } : undefined,
    lines:
      lines?.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxAmount: l.taxAmount,
        discountAmount: l.discountAmount,
        taxProfileId: l.taxProfileId ?? null,
        grnLineId: l.grnLineId ?? null,
      })) ?? undefined,
  };
}

async function assertGrnMatchesIfPresent(
  manager: EntityManager,
  grnId: string | undefined | null,
  supplierId: string,
  warehouseId: string
): Promise<void> {
  if (!grnId) return;
  const grn = await manager.findOne(Grn, { where: { id: grnId } });
  if (!grn) throw new Error('GRN not found');
  if (grn.supplierId !== supplierId) throw new Error('GRN supplier must match purchase return');
  if (grn.warehouseId !== warehouseId) throw new Error('GRN warehouse must match purchase return');
}

export async function listPurchaseReturns(req: Request): Promise<ControllerResult> {
  const { limit, offset } = getPagination(req);
  const qb = PurchaseReturn.createQueryBuilder('r')
    .leftJoinAndSelect('r.supplier', 's')
    .leftJoinAndSelect('r.warehouse', 'w')
    .orderBy('r.returnDate', 'DESC')
    .addOrderBy('r.createdAt', 'DESC')
    .take(limit)
    .skip(offset);
  if (req.query.supplierId) qb.andWhere('r.supplierId = :sid', { sid: req.query.supplierId });
  if (req.query.status) qb.andWhere('r.status = :st', { st: req.query.status });
  const [rows, total] = await qb.getManyAndCount();
  return ok({ data: rows.map((r) => serialize(r)), meta: { total, limit, offset } });
}

export async function getPurchaseReturn(req: Request): Promise<ControllerResult> {
  const row = await PurchaseReturn.findOne({
    where: { id: req.params.id },
    relations: ['lines', 'supplier', 'warehouse'],
  });
  if (!row) throw new HttpError(404, { error: 'Not found' });
  return ok({ data: serialize(row, row.lines) });
}

export async function createPurchaseReturn(
  req: Request,
  body: CreatePurchaseReturnInput
): Promise<ControllerResult> {
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
      await assertGrnMatchesIfPresent(manager, b.grnId ?? undefined, b.supplierId, b.warehouseId);
      const totals = await computePurchaseDocumentTotals(
        manager,
        b.supplierId,
        b.lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: String(l.unitPrice),
          discountAmount: l.discountAmount != null ? String(l.discountAmount) : '0',
          taxProfileId: l.taxProfileId,
        })),
        b.discountAmount
      );

      const pr = manager.create(PurchaseReturn, {
        supplierId: b.supplierId,
        warehouseId: b.warehouseId,
        returnDate: b.returnDate.slice(0, 10),
        status: 'draft',
        grnId: b.grnId ?? undefined,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discountAmount: totals.discountAmount,
        total: totals.total,
        notes: b.notes ?? undefined,
        createdBy: userId,
      });
      await manager.save(pr);

      for (let i = 0; i < totals.lines.length; i++) {
        const l = totals.lines[i];
        const src = b.lines[i];
        await manager.save(
          manager.create(PurchaseReturnLine, {
            purchaseReturnId: pr.id,
            productId: l.productId,
            quantity: parseDecimalStrict(String(l.quantity)),
            unitPrice: l.unitPrice,
            taxAmount: l.taxAmount,
            discountAmount: l.discountAmount ?? '0.0000',
            taxProfileId: l.taxProfileId ?? undefined,
            grnLineId: src.grnLineId ?? undefined,
          })
        );
      }

      return manager.findOneOrFail(PurchaseReturn, {
        where: { id: pr.id },
        relations: ['lines', 'supplier', 'warehouse'],
      });
    });
    return created({ data: serialize(row, row.lines) });
  } catch (e) {
    throw new HttpError(400, { error: e instanceof Error ? e.message : 'Failed to create purchase return' });
  }
}

export async function updatePurchaseReturn(
  req: Request,
  body: UpdatePurchaseReturnInput
): Promise<ControllerResult> {
  try {
    const row = await runInTransaction(async (manager) => {
      const pr = await manager.findOne(PurchaseReturn, {
        where: { id: req.params.id },
        relations: ['lines'],
      });
      if (!pr) throw new Error('Not found');
      if (pr.status !== 'draft') throw new Error('Only draft purchase returns can be edited');
      const b = body;
      if (b.supplierId !== undefined) pr.supplierId = b.supplierId;
      if (b.warehouseId !== undefined) pr.warehouseId = b.warehouseId;
      if (b.returnDate !== undefined) pr.returnDate = b.returnDate.slice(0, 10);
      if (b.notes !== undefined) pr.notes = b.notes ?? undefined;
      if (b.grnId !== undefined) pr.grnId = b.grnId ?? undefined;

      await assertWarehouseInScope(pr.warehouseId, undefined);
      await assertGrnMatchesIfPresent(manager, pr.grnId, pr.supplierId, pr.warehouseId);

      if (b.lines) {
        for (const line of b.lines) {
          await assertProductInScope(line.productId, undefined);
        }
        await manager.delete(PurchaseReturnLine, { purchaseReturnId: pr.id });
        const totals = await computePurchaseDocumentTotals(
          manager,
          pr.supplierId,
          b.lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: String(l.unitPrice),
            discountAmount: l.discountAmount != null ? String(l.discountAmount) : '0',
            taxProfileId: l.taxProfileId,
          })),
          b.discountAmount !== undefined ? b.discountAmount : pr.discountAmount
        );
        pr.subtotal = totals.subtotal;
        pr.taxAmount = totals.taxAmount;
        pr.discountAmount = totals.discountAmount;
        pr.total = totals.total;
        for (let i = 0; i < totals.lines.length; i++) {
          const l = totals.lines[i];
          const src = b.lines[i];
          await manager.save(
            manager.create(PurchaseReturnLine, {
              purchaseReturnId: pr.id,
              productId: l.productId,
              quantity: parseDecimalStrict(String(l.quantity)),
              unitPrice: l.unitPrice,
              taxAmount: l.taxAmount,
              discountAmount: l.discountAmount ?? '0.0000',
              taxProfileId: l.taxProfileId ?? undefined,
              grnLineId: src.grnLineId ?? undefined,
            })
          );
        }
      } else if (b.discountAmount !== undefined) {
        const oldLines = pr.lines ?? [];
        const lines = oldLines.map((l) => ({
          productId: l.productId,
          quantity: parseFloat(l.quantity),
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
          taxProfileId: l.taxProfileId,
        }));
        const totals = await computePurchaseDocumentTotals(manager, pr.supplierId, lines, b.discountAmount);
        pr.subtotal = totals.subtotal;
        pr.taxAmount = totals.taxAmount;
        pr.discountAmount = totals.discountAmount;
        pr.total = totals.total;
        await manager.delete(PurchaseReturnLine, { purchaseReturnId: pr.id });
        for (let i = 0; i < totals.lines.length; i++) {
          const l = totals.lines[i];
          const old = oldLines[i];
          await manager.save(
            manager.create(PurchaseReturnLine, {
              purchaseReturnId: pr.id,
              productId: l.productId,
              quantity: parseDecimalStrict(String(l.quantity)),
              unitPrice: l.unitPrice,
              taxAmount: l.taxAmount,
              discountAmount: l.discountAmount ?? '0.0000',
              taxProfileId: l.taxProfileId ?? undefined,
              grnLineId: old?.grnLineId,
            })
          );
        }
      }

      await manager.save(pr);
      return manager.findOneOrFail(PurchaseReturn, {
        where: { id: pr.id },
        relations: ['lines', 'supplier', 'warehouse'],
      });
    });
    return ok({ data: serialize(row, row.lines) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const msg = e instanceof Error ? e.message : 'Update failed';
    if (msg === 'Not found') throw new HttpError(404, { error: msg });
    throw new HttpError(400, { error: msg });
  }
}

export async function postPurchaseReturn(req: Request): Promise<ControllerResult> {
  try {
    await runInTransaction(async (manager) => {
      const pr = await manager.findOne(PurchaseReturn, {
        where: { id: req.params.id },
        relations: ['lines'],
      });
      if (!pr) throw new Error('Not found');
      if (pr.status !== 'draft') throw new Error('Only draft purchase returns can be posted');
      await assertDateNotPeriodLocked(manager, pr.returnDate);
      await assertWarehouseInScope(pr.warehouseId, undefined);
      for (const line of pr.lines ?? []) {
        await assertProductInScope(line.productId, undefined);
      }

      const linesForCalc =
        pr.lines?.map((l) => ({
          productId: l.productId,
          quantity: parseFloat(l.quantity),
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
          taxProfileId: l.taxProfileId,
        })) ?? [];
      const totals = await computePurchaseDocumentTotals(
        manager,
        pr.supplierId,
        linesForCalc,
        pr.discountAmount
      );
      const inventoryCredit = moneySub(totals.subtotal, totals.discountAmount);

      const prLines = pr.lines ?? [];
      if (prLines.length !== totals.lines.length) {
        throw new Error('Line count mismatch; save purchase return before posting');
      }
      for (let i = 0; i < prLines.length; i++) {
        const line = prLines[i];
        const cmp = totals.lines[i];
        const qty = cmp.quantity;
        if (qty <= 0) continue;
        const delta = (-qty).toFixed(4);
        await applyMovement(manager, {
          productId: line.productId,
          warehouseId: pr.warehouseId,
          quantityDelta: delta,
          refType: 'purchase_return',
          refId: pr.id,
          movementDate: pr.returnDate,
          notes: `Purchase return ${pr.id}`,
          userId: req.auth?.userId,
        });
      }

      await postPurchaseReturnJournal(manager, {
        entryDate: pr.returnDate,
        reference: `PR-${pr.id.slice(0, 8)}`,
        description: 'Posted purchase return',
        userId: req.auth?.userId,
        purchaseReturnId: pr.id,
        inventoryCredit,
        taxAmount: totals.taxAmount,
        total: totals.total,
      });

      pr.subtotal = totals.subtotal;
      pr.taxAmount = totals.taxAmount;
      pr.discountAmount = totals.discountAmount;
      pr.total = totals.total;
      pr.status = 'posted';
      await manager.save(pr);
    });

    const row = await PurchaseReturn.findOne({
      where: { id: req.params.id },
      relations: ['lines', 'supplier', 'warehouse'],
    });
    return ok({ data: serialize(row!, row!.lines) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const msg = e instanceof Error ? e.message : 'Post failed';
    if (msg === 'Not found') throw new HttpError(404, { error: msg });
    throw new HttpError(400, { error: msg });
  }
}

export async function deletePurchaseReturn(req: Request): Promise<ControllerResult> {
  const pr = await PurchaseReturn.findOne({ where: { id: req.params.id } });
  if (!pr) throw new HttpError(404, { error: 'Not found' });
  if (pr.status !== 'draft') {
    throw new HttpError(400, { error: 'Only draft purchase returns can be deleted' });
  }
  await PurchaseReturn.delete({ id: pr.id });
  return ok({ data: { id: req.params.id, deleted: true } });
}
