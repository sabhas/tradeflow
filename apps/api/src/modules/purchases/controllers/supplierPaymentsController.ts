import type { Request } from 'express';
import type { z } from 'zod';
import { createSupplierPaymentSchema } from '@tradeflow/shared';
import { dataSource, Supplier, SupplierPayment, SupplierPaymentAllocation } from '@tradeflow/db';
import { getPagination } from '../../../shared/utils/pagination';
import { postSupplierPaymentJournal } from '../../accounting/services/accountingPosting';
import { resolveLiquidAccountId } from '../../settings/services/companySettings';
import { validateSupplierPaymentAllocations } from '../services/supplierPayables';
import { runInTransaction } from '../../inventory/services/inventoryService';
import { assertDateNotPeriodLocked } from '../../accounting/services/periodLock';
import { parseDecimalStrict } from '../../../shared/utils/decimal';
import { created, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';

type CreateSupplierPaymentInput = z.infer<typeof createSupplierPaymentSchema> & { useDebitAmount?: string };

function parseMoneyLike(value: string | number | null | undefined): number {
  const raw = String(value ?? '0')
    .replace(/,/g, '')
    .trim();
  return parseFloat(raw || '0');
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

async function getAvailableSupplierDebitAmount(supplierId: string, paymentDate: string): Promise<number> {
  const supplier = await Supplier.findOne({ where: { id: supplierId } });
  if (!supplier) throw new HttpError(404, { error: 'Supplier not found' });
  const rows = await SupplierPayment.getRepository().query(
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
  return parseFloat(rows[0]?.available ?? '0');
}

async function getAvailableLiquidBalance(paymentMethod: string, paymentDate: string): Promise<number> {
  const liquidAccountId = await resolveLiquidAccountId(dataSource.manager, paymentMethod);
  const rows = await SupplierPayment.getRepository().query(
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
  return parseFloat(rows[0]?.available ?? '0');
}

function serialize(p: SupplierPayment, allocations?: SupplierPaymentAllocation[]) {
  return {
    id: p.id,
    supplierId: p.supplierId,
    paymentDate: p.paymentDate,
    amount: p.amount,
    paymentMethod: p.paymentMethod,
    reference: p.reference ?? null,
    createdBy: p.createdBy ?? null,
    createdAt: p.createdAt,
    supplier: p.supplier ? { id: p.supplier.id, name: p.supplier.name } : undefined,
    allocations:
      allocations?.map((a) => ({
        id: a.id,
        supplierInvoiceId: a.supplierInvoiceId,
        amount: a.amount,
      })) ?? undefined,
  };
}

export async function listSupplierPayments(req: Request): Promise<ControllerResult> {
  const { limit, offset } = getPagination(req);
  const qb = SupplierPayment.createQueryBuilder('p').leftJoinAndSelect('p.supplier', 's').where('1=1');
  if (req.query.supplierId) qb.andWhere('p.supplierId = :sid', { sid: req.query.supplierId });
  qb.orderBy('p.paymentDate', 'DESC').addOrderBy('p.createdAt', 'DESC').take(limit).skip(offset);
  const [rows, total] = await qb.getManyAndCount();
  return ok({ data: rows.map((r) => serialize(r)), meta: { total, limit, offset } });
}

export async function getSupplierPayment(req: Request): Promise<ControllerResult> {
  const p = await SupplierPayment.findOne({
    where: { id: req.params.id },
    relations: ['allocations', 'supplier'],
  });
  if (!p) {
    throw new HttpError(404, { error: 'Not found' });
  }
  return ok({ data: serialize(p, p.allocations) });
}

export async function createSupplierPayment(
  req: Request,
  body: CreateSupplierPaymentInput
): Promise<ControllerResult> {
  const userId = req.auth?.userId;
  const payAmt = parseMoneyLike(body.amount);
  const useDebitAmt = parseMoneyLike(body.useDebitAmount ?? '0');
  const allocSum = body.allocations.reduce((s, a) => s + parseMoneyLike(a.amount), 0);
  if (!Number.isFinite(payAmt) || !Number.isFinite(useDebitAmt) || !Number.isFinite(allocSum)) {
    throw new HttpError(400, { error: 'Invalid numeric amount in payment request' });
  }
  if (payAmt < 0 || useDebitAmt < 0) {
    throw new HttpError(400, { error: 'Amounts cannot be negative' });
  }
  const expectedCents = toCents(payAmt) + toCents(useDebitAmt);
  const allocatedCents = toCents(allocSum);
  if (expectedCents !== allocatedCents) {
    throw new HttpError(400, {
      error: `Allocations must equal payment amount + debit used (expected ${(expectedCents / 100).toFixed(
        2
      )}, got ${(allocatedCents / 100).toFixed(2)})`,
    });
  }
  const paymentDate = body.paymentDate.slice(0, 10);
  const availableLiquidBalance = await getAvailableLiquidBalance(body.paymentMethod, paymentDate);
  if (payAmt - availableLiquidBalance > 0.01) {
    throw new HttpError(400, {
      error: `Insufficient balance. Available ${availableLiquidBalance.toFixed(4)}, required ${payAmt.toFixed(4)}`,
    });
  }
  const availableDebit = await getAvailableSupplierDebitAmount(body.supplierId, paymentDate);
  if (useDebitAmt - availableDebit > 0.01) {
    throw new HttpError(400, {
      error: `Only ${availableDebit.toFixed(4)} debit balance is available to use`,
    });
  }

  const row = await runInTransaction(async (manager) => {
    await validateSupplierPaymentAllocations(manager, body.supplierId, body.allocations);

    const p = manager.create(SupplierPayment, {
      supplierId: body.supplierId,
      paymentDate,
      amount: parseDecimalStrict(String(payAmt)),
      paymentMethod: body.paymentMethod,
      reference: body.reference ?? undefined,
      createdBy: userId,
    });
    await manager.save(p);

    for (const a of body.allocations) {
      await manager.save(
        manager.create(SupplierPaymentAllocation, {
          supplierPaymentId: p.id,
          supplierInvoiceId: a.supplierInvoiceId,
          amount: parseDecimalStrict(String(parseMoneyLike(a.amount))),
        })
      );
    }

    await assertDateNotPeriodLocked(manager, p.paymentDate);
    if (payAmt > 0.00005) {
      await postSupplierPaymentJournal(manager, {
        entryDate: p.paymentDate,
        reference: p.reference || `PAY-${p.id.slice(0, 8)}`,
        userId,
        supplierPaymentId: p.id,
        amount: p.amount,
        paymentMethod: p.paymentMethod,
      });
    }

    return manager.findOneOrFail(SupplierPayment, {
      where: { id: p.id },
      relations: ['allocations', 'supplier'],
    });
  });
  return created({ data: serialize(row, row.allocations) });
}
