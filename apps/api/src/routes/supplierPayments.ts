import { Router } from 'express';
import { dataSource, SupplierPayment, SupplierPaymentAllocation } from '@tradeflow/db';
import { createSupplierPaymentSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';
import { postSupplierPaymentJournal } from '../services/accountingPosting';
import { validateSupplierPaymentAllocations } from '../services/supplierPayables';
import { runInTransaction } from '../services/inventoryService';
import { assertDateNotPeriodLocked } from '../services/periodLock';
import { parseDecimalStrict } from '../utils/decimal';

export const supplierPaymentsRouter = Router();
supplierPaymentsRouter.use(authMiddleware, loadUser);

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

supplierPaymentsRouter.get('/', requirePermission('purchases.payments', 'read'), async (req, res) => {
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
  res.json({ data: rows.map((r) => serialize(r)), meta: { total, limit, offset } });
});

supplierPaymentsRouter.get('/:id', requirePermission('purchases.payments', 'read'), async (req, res) => {
  const p = await dataSource.getRepository(SupplierPayment).findOne({
    where: { id: req.params.id },
    relations: ['allocations', 'supplier'],
  });
  if (!p) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ data: serialize(p, p.allocations) });
});

supplierPaymentsRouter.post(
  '/',
  requirePermission('purchases.payments', 'write'),
  auditMiddleware({ entity: 'SupplierPayment', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createSupplierPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const branchId = b.branchId ?? req.user?.branchId ?? undefined;
    const userId = req.auth?.userId;
    const payAmt = parseFloat(b.amount);
    const allocSum = b.allocations.reduce((s, a) => s + parseFloat(a.amount), 0);
    if (Math.abs(payAmt - allocSum) > 0.01) {
      res.status(400).json({ error: 'Allocation amounts must sum to payment amount' });
      return;
    }

    try {
      const row = await runInTransaction(async (manager) => {
        await validateSupplierPaymentAllocations(manager, b.supplierId, b.allocations);

        const p = manager.create(SupplierPayment, {
          supplierId: b.supplierId,
          paymentDate: b.paymentDate.slice(0, 10),
          amount: parseDecimalStrict(b.amount),
          paymentMethod: b.paymentMethod,
          reference: b.reference ?? undefined,
          branchId: branchId ?? undefined,
          createdBy: userId,
        });
        await manager.save(p);

        for (const a of b.allocations) {
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
      res.status(201).json({ data: serialize(row, row.allocations) });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Payment failed' });
    }
  }
);
