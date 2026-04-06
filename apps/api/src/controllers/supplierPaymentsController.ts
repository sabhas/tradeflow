import type { Request } from 'express';
import type { z } from 'zod';
import { createSupplierPaymentSchema } from '@tradeflow/shared';
import { dataSource, SupplierPayment, SupplierPaymentAllocation } from '@tradeflow/db';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';
import { postSupplierPaymentJournal } from '../services/accountingPosting';
import { validateSupplierPaymentAllocations } from '../services/supplierPayables';
import { runInTransaction } from '../services/inventoryService';
import { assertDateNotPeriodLocked } from '../services/periodLock';
import { parseDecimalStrict } from '../utils/decimal';
import { created, ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

type CreateSupplierPaymentInput = z.infer<typeof createSupplierPaymentSchema>;

function serialize(p: SupplierPayment, allocations?: SupplierPaymentAllocation[]) {
  return {
    id: p.id,
    supplierId: p.supplierId,
    paymentDate: p.paymentDate,
    amount: p.amount,
    paymentMethod: p.paymentMethod,
    reference: p.reference ?? null,
    branchId: p.branchId ?? null,
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
  const branchId = resolveBranchId(req);
  const { limit, offset } = getPagination(req);
  const qb = dataSource
    .getRepository(SupplierPayment)
    .createQueryBuilder('p')
    .leftJoinAndSelect('p.supplier', 's')
    .where('1=1');
  if (branchId) qb.andWhere('(p.branch_id IS NULL OR p.branch_id = :bid)', { bid: branchId });
  if (req.query.supplierId) qb.andWhere('p.supplier_id = :sid', { sid: req.query.supplierId });
  qb.orderBy('p.payment_date', 'DESC').addOrderBy('p.created_at', 'DESC').take(limit).skip(offset);
  const [rows, total] = await qb.getManyAndCount();
  return ok({ data: rows.map((r) => serialize(r)), meta: { total, limit, offset } });
}

export async function getSupplierPayment(req: Request): Promise<ControllerResult> {
  const p = await dataSource.getRepository(SupplierPayment).findOne({
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
  const branchId = body.branchId ?? req.user?.branchId ?? undefined;
  const userId = req.auth?.userId;
  const payAmt = parseFloat(body.amount);
  const allocSum = body.allocations.reduce((s, a) => s + parseFloat(a.amount), 0);
  if (Math.abs(payAmt - allocSum) > 0.01) {
    throw new HttpError(400, { error: 'Allocation amounts must sum to payment amount' });
  }

  try {
    const row = await runInTransaction(async (manager) => {
      await validateSupplierPaymentAllocations(manager, body.supplierId, body.allocations);

      const p = manager.create(SupplierPayment, {
        supplierId: body.supplierId,
        paymentDate: body.paymentDate.slice(0, 10),
        amount: parseDecimalStrict(body.amount),
        paymentMethod: body.paymentMethod,
        reference: body.reference ?? undefined,
        branchId: branchId ?? undefined,
        createdBy: userId,
      });
      await manager.save(p);

      for (const a of body.allocations) {
        await manager.save(
          manager.create(SupplierPaymentAllocation, {
            supplierPaymentId: p.id,
            supplierInvoiceId: a.supplierInvoiceId,
            amount: parseDecimalStrict(a.amount),
          })
        );
      }

      await assertDateNotPeriodLocked(manager, p.paymentDate);
      await postSupplierPaymentJournal(manager, {
        entryDate: p.paymentDate,
        reference: p.reference || `PAY-${p.id.slice(0, 8)}`,
        branchId: branchId ?? undefined,
        userId,
        supplierPaymentId: p.id,
        amount: p.amount,
        paymentMethod: p.paymentMethod,
      });

      return manager.findOneOrFail(SupplierPayment, {
        where: { id: p.id },
        relations: ['allocations', 'supplier'],
      });
    });
    return created({ data: serialize(row, row.allocations) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, { error: e instanceof Error ? e.message : 'Payment failed' });
  }
}
