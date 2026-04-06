import type { Request } from 'express';
import { IsNull, type EntityManager } from 'typeorm';
import type { z } from 'zod';
import {
  dataSource,
  Grn,
  GrnLine,
  InventoryMovement,
  Supplier,
  SupplierInvoice,
  SupplierInvoiceLine,
} from '@tradeflow/db';
import { createSupplierInvoiceSchema, updateSupplierInvoiceSchema } from '@tradeflow/shared';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';
import { computePurchaseDocumentTotals } from '../services/purchaseTotals';
import { runInTransaction, assertProductInScope } from '../services/inventoryService';
import { assertDateNotPeriodLocked } from '../services/periodLock';
import { postSupplierInvoiceJournal } from '../services/accountingPosting';
import { addDaysIso } from '../services/salesTotals';
import { parseDecimalStrict } from '../utils/decimal';
import { moneySub } from '../utils/money';
import { created, ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

type CreateSupplierInvoiceInput = z.infer<typeof createSupplierInvoiceSchema>;
type UpdateSupplierInvoiceInput = z.infer<typeof updateSupplierInvoiceSchema>;

async function resolveSupplierDueDate(manager: EntityManager, supplierId: string, invoiceDate: string): Promise<string> {
  const s = await manager.findOne(Supplier, {
    where: { id: supplierId, deletedAt: IsNull() },
    relations: ['paymentTerms'],
  });
  if (!s) throw new Error('Supplier not found');
  const net = s.paymentTerms?.netDays ?? 30;
  return addDaysIso(invoiceDate, net);
}

function serialize(inv: SupplierInvoice, lines?: SupplierInvoiceLine[]) {
  return {
    id: inv.id,
    supplierId: inv.supplierId,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    purchaseOrderId: inv.purchaseOrderId ?? null,
    grnId: inv.grnId ?? null,
    status: inv.status,
    subtotal: inv.subtotal,
    taxAmount: inv.taxAmount,
    discountAmount: inv.discountAmount,
    total: inv.total,
    notes: inv.notes ?? null,
    branchId: inv.branchId ?? null,
    createdBy: inv.createdBy ?? null,
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
    supplier: inv.supplier ? { id: inv.supplier.id, name: inv.supplier.name } : undefined,
    lines:
      lines?.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxAmount: l.taxAmount,
        discountAmount: l.discountAmount,
        grnLineId: l.grnLineId ?? null,
        taxProfileId: l.taxProfileId ?? null,
      })) ?? undefined,
  };
}

export async function listSupplierInvoices(req: Request): Promise<ControllerResult> {
  const branchId = resolveBranchId(req);
  const { limit, offset } = getPagination(req);
  const qb = SupplierInvoice
    .createQueryBuilder('si')
    .leftJoinAndSelect('si.supplier', 's')
    .where('1=1');
  if (branchId) qb.andWhere('(si.branch_id IS NULL OR si.branch_id = :bid)', { bid: branchId });
  if (req.query.supplierId) qb.andWhere('si.supplier_id = :sid', { sid: req.query.supplierId });
  if (req.query.status) qb.andWhere('si.status = :st', { st: req.query.status });
  qb.orderBy('si.invoice_date', 'DESC').addOrderBy('si.created_at', 'DESC').take(limit).skip(offset);
  const [rows, total] = await qb.getManyAndCount();
  return ok({ data: rows.map((r) => serialize(r)), meta: { total, limit, offset } });
}

export async function listOpenSupplierInvoices(req: Request): Promise<ControllerResult> {
  const supplierId = req.query.supplierId as string | undefined;
  if (!supplierId) {
    throw new HttpError(400, { error: 'supplierId required' });
  }
  const rows = await dataSource.query(
    `
    SELECT si.id, si.invoice_number AS "invoiceNumber", si.invoice_date AS "invoiceDate",
      si.due_date AS "dueDate", si.total::text AS total,
      (si.total::numeric - COALESCE((SELECT SUM(amount) FROM supplier_payment_allocations spa WHERE spa.supplier_invoice_id = si.id), 0))::text AS "openAmount"
    FROM supplier_invoices si
    WHERE si.supplier_id = $1 AND si.status = 'posted'
      AND (si.total::numeric - COALESCE((SELECT SUM(amount) FROM supplier_payment_allocations spa WHERE spa.supplier_invoice_id = si.id), 0)) > 0.0001
    ORDER BY si.due_date ASC
    `,
    [supplierId]
  );
  return ok({ data: rows });
}

export async function getSupplierInvoice(req: Request): Promise<ControllerResult> {
  const inv = await SupplierInvoice.findOne({
    where: { id: req.params.id },
    relations: ['lines', 'supplier'],
  });
  if (!inv) {
    throw new HttpError(404, { error: 'Not found' });
  }
  return ok({ data: serialize(inv, inv.lines) });
}

export async function createSupplierInvoice(req: Request, body: CreateSupplierInvoiceInput): Promise<ControllerResult> {
  const b = body;
  const branchId = b.branchId ?? req.user?.branchId ?? undefined;
  const userId = req.auth?.userId;

  try {
    const row = await runInTransaction(async (manager) => {
      if (b.grnId) {
        const grn = await manager.findOne(Grn, { where: { id: b.grnId } });
        if (!grn) throw new Error('GRN not found');
        if (grn.supplierId !== b.supplierId) throw new Error('GRN supplier mismatch');
        for (const ln of b.lines) {
          if (!ln.grnLineId) continue;
          const gl = await manager.findOne(GrnLine, { where: { id: ln.grnLineId } });
          if (!gl || gl.grnId !== b.grnId) throw new Error('GRN line does not belong to linked GRN');
        }
      }

      for (const line of b.lines) {
        await assertProductInScope(line.productId, branchId);
      }

      const totals = await computePurchaseDocumentTotals(
        manager,
        b.supplierId,
        b.lines.map((l) => ({
          productId: l.productId,
          quantity: String(l.quantity),
          unitPrice: String(l.unitPrice),
          discountAmount: l.discountAmount != null ? String(l.discountAmount) : '0',
          taxProfileId: l.taxProfileId,
        })),
        b.discountAmount
      );

      const due =
        b.dueDate && b.dueDate !== null ? b.dueDate.slice(0, 10) : await resolveSupplierDueDate(manager, b.supplierId, b.invoiceDate);

      const inv = manager.create(SupplierInvoice, {
        supplierId: b.supplierId,
        invoiceNumber: b.invoiceNumber.trim(),
        invoiceDate: b.invoiceDate.slice(0, 10),
        dueDate: due,
        purchaseOrderId: b.purchaseOrderId ?? undefined,
        grnId: b.grnId ?? undefined,
        status: 'draft',
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discountAmount: totals.discountAmount,
        total: totals.total,
        notes: b.notes ?? undefined,
        branchId: branchId ?? undefined,
        createdBy: userId,
      });
      await manager.save(inv);

      for (let i = 0; i < totals.lines.length; i++) {
        const cmp = totals.lines[i];
        const src = b.lines[i];
        await manager.save(
          manager.create(SupplierInvoiceLine, {
            supplierInvoiceId: inv.id,
            productId: cmp.productId,
            quantity: parseDecimalStrict(String(src.quantity)),
            unitPrice: parseDecimalStrict(String(src.unitPrice)),
            taxAmount: cmp.taxAmount,
            discountAmount: cmp.discountAmount,
            grnLineId: src.grnLineId ?? undefined,
            taxProfileId: src.taxProfileId ?? undefined,
          })
        );
      }

      return manager.findOneOrFail(SupplierInvoice, {
        where: { id: inv.id },
        relations: ['lines', 'supplier'],
      });
    });
    return created({ data: serialize(row, row.lines) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const msg = e instanceof Error ? e.message : 'Create failed';
    if (msg.includes('UQ_supplier_invoice_number')) {
      throw new HttpError(400, { error: 'Invoice number already exists for this supplier' });
    }
    throw new HttpError(400, { error: msg });
  }
}

export async function updateSupplierInvoice(req: Request, body: UpdateSupplierInvoiceInput): Promise<ControllerResult> {
  const b = body;
  const branchId = b.branchId ?? req.user?.branchId ?? undefined;
  try {
    const row = await runInTransaction(async (manager) => {
      const inv = await manager.findOne(SupplierInvoice, {
        where: { id: req.params.id },
        relations: ['lines'],
      });
      if (!inv) throw new Error('Not found');
      if (inv.status !== 'draft') throw new Error('Only draft supplier invoices can be edited');

      if (b.invoiceNumber !== undefined) inv.invoiceNumber = b.invoiceNumber.trim();
      if (b.invoiceDate !== undefined) inv.invoiceDate = b.invoiceDate.slice(0, 10);
      if (b.dueDate !== undefined && b.dueDate !== null) inv.dueDate = b.dueDate.slice(0, 10);
      if (b.purchaseOrderId !== undefined) inv.purchaseOrderId = b.purchaseOrderId ?? undefined;
      if (b.grnId !== undefined) inv.grnId = b.grnId ?? undefined;
      if (b.notes !== undefined) inv.notes = b.notes ?? undefined;
      if (b.branchId !== undefined) inv.branchId = b.branchId ?? undefined;
      const nextSupplier = b.supplierId ?? inv.supplierId;

      if (b.grnId !== undefined && inv.grnId) {
        const grn = await manager.findOne(Grn, { where: { id: inv.grnId } });
        if (grn && grn.supplierId !== nextSupplier) throw new Error('GRN supplier mismatch');
      }

      const linesIn =
        b.lines?.map((l) => ({
          productId: l.productId,
          quantity: String(l.quantity),
          unitPrice: String(l.unitPrice),
          discountAmount: l.discountAmount != null ? String(l.discountAmount) : '0',
          taxProfileId: l.taxProfileId,
          grnLineId: l.grnLineId,
        })) ?? undefined;

      if (linesIn) {
        for (const line of linesIn) {
          await assertProductInScope(line.productId, branchId);
          if (inv.grnId && line.grnLineId) {
            const gl = await manager.findOne(GrnLine, { where: { id: line.grnLineId } });
            if (!gl || gl.grnId !== inv.grnId) throw new Error('GRN line does not belong to linked GRN');
          }
        }
        const totals = await computePurchaseDocumentTotals(
          manager,
          nextSupplier,
          linesIn.map(({ grnLineId: _g, ...rest }) => rest),
          b.discountAmount ?? inv.discountAmount
        );
        inv.subtotal = totals.subtotal;
        inv.taxAmount = totals.taxAmount;
        inv.discountAmount = totals.discountAmount;
        inv.total = totals.total;
        if (b.supplierId !== undefined) inv.supplierId = b.supplierId;
        await manager.delete(SupplierInvoiceLine, { supplierInvoiceId: inv.id });
        for (let i = 0; i < totals.lines.length; i++) {
          const cmp = totals.lines[i];
          const src = linesIn[i];
          await manager.save(
            manager.create(SupplierInvoiceLine, {
              supplierInvoiceId: inv.id,
              productId: cmp.productId,
              quantity: parseDecimalStrict(String(src.quantity)),
              unitPrice: parseDecimalStrict(String(src.unitPrice)),
              taxAmount: cmp.taxAmount,
              discountAmount: cmp.discountAmount,
              grnLineId: src.grnLineId ?? undefined,
              taxProfileId: src.taxProfileId ?? undefined,
            })
          );
        }
      } else if (b.discountAmount !== undefined || b.supplierId !== undefined) {
        const dbLines = await manager.find(SupplierInvoiceLine, { where: { supplierInvoiceId: inv.id } });
        const existingLines = dbLines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
          taxProfileId: l.taxProfileId,
        }));
        const totals = await computePurchaseDocumentTotals(
          manager,
          nextSupplier,
          existingLines,
          b.discountAmount ?? inv.discountAmount
        );
        inv.subtotal = totals.subtotal;
        inv.taxAmount = totals.taxAmount;
        inv.discountAmount = totals.discountAmount;
        inv.total = totals.total;
        if (b.supplierId !== undefined) inv.supplierId = b.supplierId;
        for (let i = 0; i < totals.lines.length; i++) {
          dbLines[i].taxAmount = totals.lines[i].taxAmount;
          dbLines[i].discountAmount = totals.lines[i].discountAmount ?? '0.0000';
          await manager.save(dbLines[i]);
        }
      }

      if (b.supplierId !== undefined) inv.supplierId = b.supplierId;
      await manager.save(inv);
      return manager.findOneOrFail(SupplierInvoice, {
        where: { id: inv.id },
        relations: ['lines', 'supplier'],
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

export async function postSupplierInvoice(req: Request): Promise<ControllerResult> {
  try {
    await runInTransaction(async (manager) => {
      const inv = await manager.findOne(SupplierInvoice, {
        where: { id: req.params.id },
        relations: ['lines'],
      });
      if (!inv) throw new Error('Not found');
      if (inv.status !== 'draft') throw new Error('Only draft invoices can be posted');
      await assertDateNotPeriodLocked(manager, inv.invoiceDate);

      const linesForCalc =
        inv.lines?.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
          taxProfileId: l.taxProfileId,
        })) ?? [];
      const totals = await computePurchaseDocumentTotals(manager, inv.supplierId, linesForCalc, inv.discountAmount);
      const inventoryDebit = moneySub(totals.subtotal, totals.discountAmount);

      await postSupplierInvoiceJournal(manager, {
        entryDate: inv.invoiceDate,
        reference: inv.invoiceNumber,
        description: `Supplier invoice ${inv.invoiceNumber}`,
        branchId: inv.branchId ?? undefined,
        userId: req.auth?.userId,
        supplierInvoiceId: inv.id,
        inventoryAmount: inventoryDebit,
        taxAmount: totals.taxAmount,
        total: totals.total,
      });

      for (let i = 0; i < (inv.lines?.length ?? 0); i++) {
        const line = inv.lines![i];
        const cmp = totals.lines[i];
        if (!line.grnLineId) continue;
        const qty = parseFloat(cmp.quantity);
        if (qty <= 0) continue;
        const unitCost = (parseFloat(cmp.lineBase) / qty).toFixed(4);
        const uc = parseDecimalStrict(unitCost);
        await manager.update(
          InventoryMovement,
          { grnLineId: line.grnLineId },
          { unitCost: uc }
        );
        await manager.query(`UPDATE stock_layers SET unit_cost = $1::numeric WHERE grn_line_id = $2`, [
          uc,
          line.grnLineId,
        ]);
      }

      inv.subtotal = totals.subtotal;
      inv.taxAmount = totals.taxAmount;
      inv.discountAmount = totals.discountAmount;
      inv.total = totals.total;
      inv.status = 'posted';
      await manager.save(inv);
    });

    const inv = await SupplierInvoice.findOne({
      where: { id: req.params.id },
      relations: ['lines', 'supplier'],
    });
    return ok({ data: serialize(inv!, inv!.lines) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const msg = e instanceof Error ? e.message : 'Post failed';
    if (msg === 'Not found') throw new HttpError(404, { error: msg });
    throw new HttpError(400, { error: msg });
  }
}

export async function deleteSupplierInvoice(req: Request): Promise<ControllerResult> {
  const repo = SupplierInvoice.getRepository();
  const inv = await repo.findOne({ where: { id: req.params.id } });
  if (!inv) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (inv.status !== 'draft') {
    throw new HttpError(400, { error: 'Only draft supplier invoices can be deleted' });
  }
  await repo.remove(inv);
  return ok({ data: { id: req.params.id, deleted: true } });
}
