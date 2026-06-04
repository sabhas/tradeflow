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
import { computePurchaseDocumentTotals } from './purchaseTotals';
import { resolveLiquidAccountId } from '../../settings/services/companySettings';
import { runInTransaction, assertProductInScope } from '../../inventory/services/inventoryService';
import { assertDateNotPeriodLocked } from '../../accounting/services/periodLock';
import { postSupplierInvoiceJournal } from '../../accounting/services/accountingPosting';
import { GL_ACCOUNT_CODES } from '../../../shared/constants/glAccounts';
import { resolveSupplierDueDate } from './supplierDueDateService';
import { calculateBonus } from '../../sales/services/bonusService';
import { parseDecimalStrict } from '../../../shared/utils/decimal';
import { moneySub } from '../../../shared/utils/money';
import { assertGrnLinkableToInvoice } from './grnInvoiceSettlement';
import { HttpError } from '../../../shared/utils/httpError';

type CreateSupplierInvoiceInput = z.infer<typeof createSupplierInvoiceSchema>;
type UpdateSupplierInvoiceInput = z.infer<typeof updateSupplierInvoiceSchema>;

/** Persist header fields only — avoids TypeORM orphaning line FKs when lines were replaced via query builder. */
async function persistSupplierInvoiceHeader(manager: EntityManager, inv: SupplierInvoice): Promise<void> {
  await manager.update(
    SupplierInvoice,
    { id: inv.id },
    {
      supplierId: inv.supplierId,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      purchaseOrderId: inv.purchaseOrderId,
      grnId: inv.grnId,
      status: inv.status,
      subtotal: inv.subtotal,
      taxAmount: inv.taxAmount,
      discountAmount: inv.discountAmount,
      total: inv.total,
      notes: inv.notes,
    }
  );
}

export async function listOpenSupplierInvoices(
  supplierId: string,
  paymentDate: string,
  paymentMethod: string
): Promise<{
  rows: Array<{
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    total: string;
    openAmount: string;
  }>;
  availableDebitAmount: string;
  availableLiquidAmount: string;
  asOfDate: string;
}> {
  const supplier = await Supplier.findOne({ where: { id: supplierId, deletedAt: IsNull() } });
  if (!supplier) {
    throw new HttpError(404, { error: 'Supplier not found' });
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
  const advRows = await dataSource.query(
    `
    WITH manual_adv AS (
      SELECT COALESCE(SUM(jl.debit::numeric - jl.credit::numeric), 0) AS amount
      FROM journal_lines jl
      INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE jl.account_id = $2::uuid
        AND je.deleted_at IS NULL
        AND je.status = 'posted'
        AND je.entry_date <= $3::date
        AND (je.source_type IS NULL OR je.source_type = 'journal_reversal')
    ),
    consumed_adv AS (
      SELECT COALESCE(
        SUM(
          GREATEST(
            COALESCE(a.alloc_total, 0) - COALESCE(sp.amount::numeric, 0),
            0
          )
        ),
        0
      ) AS amount
      FROM supplier_payments sp
      LEFT JOIN (
        SELECT supplier_payment_id, SUM(amount::numeric) AS alloc_total
        FROM supplier_payment_allocations
        GROUP BY supplier_payment_id
      ) a ON a.supplier_payment_id = sp.id
      WHERE sp.supplier_id = $1
        AND sp.payment_date <= $3::date
    )
    SELECT GREATEST(
      (SELECT amount FROM manual_adv) - (SELECT amount FROM consumed_adv),
      0
    )::text AS available
    `,
    [supplierId, supplier.payableAccountId, paymentDate]
  );
  const availableDebitAmount = parseFloat(advRows[0]?.available ?? '0').toFixed(4);
  const liquidAccountId = await resolveLiquidAccountId(dataSource.manager, paymentMethod);
  const liquidRows = await dataSource.query(
    `
    SELECT COALESCE(SUM(jl.debit::numeric - jl.credit::numeric), 0)::text AS available
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.account_id = $1::uuid
      AND je.deleted_at IS NULL
      AND je.status = 'posted'
      AND je.entry_date <= $2::date
    `,
    [liquidAccountId, paymentDate]
  );
  const availableLiquidAmount = parseFloat(liquidRows[0]?.available ?? '0').toFixed(4);

  return { rows, availableDebitAmount, availableLiquidAmount, asOfDate: paymentDate };
}

export async function createSupplierInvoice(
  body: CreateSupplierInvoiceInput,
  userId: string | undefined
): Promise<SupplierInvoice> {
  const b = body;

  return runInTransaction(async (manager) => {
    if (!b.grnId) throw new Error('A posted GRN is required before creating a supplier invoice');
    await assertGrnLinkableToInvoice(manager, b.grnId, b.supplierId);
    for (const ln of b.lines) {
      if (!ln.grnLineId) continue;
      const gl = await manager.findOne(GrnLine, { where: { id: ln.grnLineId } });
      if (!gl || gl.grnId !== b.grnId) throw new Error('GRN line does not belong to linked GRN');
    }

    for (const line of b.lines) {
      await assertProductInScope(line.productId, undefined);
    }

    const bonusQuantities: string[] = [];
    for (const l of b.lines) {
      if (l.bonusQuantity != null && l.bonusQuantity !== '') {
        bonusQuantities.push(parseDecimalStrict(String(l.bonusQuantity)));
      } else {
        bonusQuantities.push(await calculateBonus(manager, l.productId, l.quantity));
      }
    }

    const totals = await computePurchaseDocumentTotals(
      manager,
      b.supplierId,
      b.lines.map((l, i) => ({
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: String(l.unitPrice),
        bonusQuantity: bonusQuantities[i],
        discountAmount: l.discountAmount != null ? String(l.discountAmount) : '0',
        taxProfileId: l.taxProfileId,
      })),
      b.discountAmount
    );

    const due =
      b.dueDate && b.dueDate !== null
        ? b.dueDate.slice(0, 10)
        : await resolveSupplierDueDate(manager, b.supplierId, b.invoiceDate);

    const inv = manager.create(SupplierInvoice, {
      supplierId: b.supplierId,
      invoiceNumber: b.invoiceNumber.trim(),
      invoiceDate: b.invoiceDate.slice(0, 10),
      dueDate: due,
      purchaseOrderId: b.purchaseOrderId ?? undefined,
      grnId: b.grnId,
      status: 'draft',
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      discountAmount: totals.discountAmount,
      total: totals.total,
      notes: b.notes ?? undefined,
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
          bonusQuantity: bonusQuantities[i],
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
}

export async function updateSupplierInvoice(
  id: string,
  body: UpdateSupplierInvoiceInput
): Promise<SupplierInvoice> {
  const b = body;

  return runInTransaction(async (manager) => {
    const inv = await manager.findOne(SupplierInvoice, {
      where: { id },
    });
    if (!inv) throw new Error('Not found');
    if (inv.status !== 'draft') throw new Error('Only draft supplier invoices can be edited');

    if (b.invoiceNumber !== undefined) inv.invoiceNumber = b.invoiceNumber.trim();
    if (b.invoiceDate !== undefined) inv.invoiceDate = b.invoiceDate.slice(0, 10);
    if (b.dueDate !== undefined && b.dueDate !== null) inv.dueDate = b.dueDate.slice(0, 10);
    if (b.purchaseOrderId !== undefined) inv.purchaseOrderId = b.purchaseOrderId ?? undefined;
    if (b.grnId !== undefined) inv.grnId = b.grnId ?? undefined;
    if (b.notes !== undefined) inv.notes = b.notes ?? undefined;
    const nextSupplier = b.supplierId ?? inv.supplierId;

    if (b.grnId !== undefined && b.grnId) {
      await assertGrnLinkableToInvoice(manager, b.grnId, nextSupplier, inv.id);
    } else if (
      b.grnId === undefined &&
      inv.grnId &&
      b.supplierId !== undefined &&
      b.supplierId !== inv.supplierId
    ) {
      const grn = await manager.findOne(Grn, { where: { id: inv.grnId } });
      if (grn && grn.supplierId !== nextSupplier) throw new Error('GRN supplier mismatch');
    }

    const linesIn =
      b.lines?.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: String(l.unitPrice),
        bonusQuantity: l.bonusQuantity != null ? String(l.bonusQuantity) : undefined,
        discountAmount: l.discountAmount != null ? String(l.discountAmount) : '0',
        taxProfileId: l.taxProfileId,
        grnLineId: l.grnLineId,
      })) ?? undefined;

    if (linesIn) {
      for (const line of linesIn) {
        await assertProductInScope(line.productId, undefined);
        if (inv.grnId && line.grnLineId) {
          const gl = await manager.findOne(GrnLine, { where: { id: line.grnLineId } });
          if (!gl || gl.grnId !== inv.grnId) throw new Error('GRN line does not belong to linked GRN');
        }
      }
      const bonusQuantities: string[] = [];
      for (const l of linesIn) {
        if (l.bonusQuantity != null && l.bonusQuantity !== '') {
          bonusQuantities.push(parseDecimalStrict(l.bonusQuantity));
        } else {
          bonusQuantities.push(await calculateBonus(manager, l.productId, l.quantity));
        }
      }
      const totals = await computePurchaseDocumentTotals(
        manager,
        nextSupplier,
        linesIn.map(({ grnLineId: _g, ...rest }, i) => ({
          ...rest,
          bonusQuantity: bonusQuantities[i],
        })),
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
        await manager.insert(SupplierInvoiceLine, {
          supplierInvoiceId: inv.id,
          productId: cmp.productId,
          quantity: parseDecimalStrict(String(src.quantity)),
          bonusQuantity: bonusQuantities[i],
          unitPrice: parseDecimalStrict(String(src.unitPrice)),
          taxAmount: cmp.taxAmount,
          discountAmount: cmp.discountAmount,
          grnLineId: src.grnLineId ?? undefined,
          taxProfileId: src.taxProfileId ?? undefined,
        });
      }
    } else if (b.discountAmount !== undefined || b.supplierId !== undefined) {
      const dbLines = await manager.find(SupplierInvoiceLine, { where: { supplierInvoiceId: inv.id } });
      const existingLines = dbLines.map((l) => ({
        productId: l.productId,
        quantity: parseFloat(l.quantity),
        unitPrice: l.unitPrice,
        bonusQuantity: l.bonusQuantity ?? '0',
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
    await persistSupplierInvoiceHeader(manager, inv);
    return manager.findOneOrFail(SupplierInvoice, {
      where: { id: inv.id },
      relations: ['lines', 'supplier'],
    });
  });
}

export async function postSupplierInvoice(id: string, userId: string | undefined): Promise<void> {
  await runInTransaction(async (manager) => {
    const inv = await manager.findOne(SupplierInvoice, {
      where: { id },
      relations: ['lines'],
    });
    if (!inv) throw new Error('Not found');
    if (inv.status !== 'draft') throw new Error('Only draft invoices can be posted');
    await assertDateNotPeriodLocked(manager, inv.invoiceDate);

    const linesForCalc =
      inv.lines?.map((l) => ({
        productId: l.productId,
        quantity: parseFloat(l.quantity),
        unitPrice: l.unitPrice,
        bonusQuantity: l.bonusQuantity ?? '0',
        discountAmount: l.discountAmount,
        taxProfileId: l.taxProfileId,
      })) ?? [];
    const totals = await computePurchaseDocumentTotals(
      manager,
      inv.supplierId,
      linesForCalc,
      inv.discountAmount
    );
    const inventoryDebit = moneySub(totals.subtotal, totals.discountAmount);

    await postSupplierInvoiceJournal(manager, {
      entryDate: inv.invoiceDate,
      reference: inv.invoiceNumber,
      description: `Supplier invoice ${inv.invoiceNumber}`,
      userId,
      supplierInvoiceId: inv.id,
      inventoryAmount: inventoryDebit,
      taxAmount: totals.taxAmount,
      total: totals.total,
      baseDebitAccountCode: inv.grnId ? GL_ACCOUNT_CODES.ACCRUED_PURCHASES : GL_ACCOUNT_CODES.INVENTORY,
    });

    for (let i = 0; i < (inv.lines?.length ?? 0); i++) {
      const line = inv.lines![i];
      const cmp = totals.lines[i];
      if (!line.grnLineId) continue;
      const paidQty = cmp.quantity;
      if (paidQty <= 0) continue;
      const bonusQty = parseFloat(line.bonusQuantity ?? '0');
      const totalQty = paidQty + bonusQty;
      const unitCost = (parseFloat(cmp.lineBase) / totalQty).toFixed(4);
      const uc = parseDecimalStrict(unitCost);
      await manager.update(InventoryMovement, { grnLineId: line.grnLineId }, { unitCost: uc });
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
}
