import { Router } from 'express';
import { dataSource, Receipt, ReceiptAllocation } from '@tradeflow/db';
import { createReceiptSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';
import { runInTransaction } from '../services/inventoryService';
import { validateReceiptAllocations } from '../services/invoicePosting';
import { postReceiptJournal } from '../services/accountingPosting';

export const receiptsRouter = Router();
receiptsRouter.use(authMiddleware, loadUser);

function serialize(r: Receipt, allocations?: ReceiptAllocation[]) {
  return {
    id: r.id,
    customerId: r.customerId,
    receiptDate: r.receiptDate,
    amount: r.amount,
    paymentMethod: r.paymentMethod,
    reference: r.reference,
    branchId: r.branchId,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    allocations:
      allocations?.map((a) => ({
        id: a.id,
        invoiceId: a.invoiceId,
        amount: a.amount,
      })) ?? undefined,
  };
}

receiptsRouter.get('/', requirePermission('sales', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const { limit, offset } = getPagination(req);
  const qb = dataSource
    .getRepository(Receipt)
    .createQueryBuilder('r')
    .orderBy('r.receipt_date', 'DESC')
    .take(limit)
    .skip(offset);
  if (branchId) qb.andWhere('(r.branch_id IS NULL OR r.branch_id = :bid)', { bid: branchId });
  if (req.query.customerId) qb.andWhere('r.customer_id = :cid', { cid: req.query.customerId });
  if (req.query.dateFrom) qb.andWhere('r.receipt_date >= :df', { df: req.query.dateFrom });
  if (req.query.dateTo) qb.andWhere('r.receipt_date <= :dt', { dt: req.query.dateTo });
  const [rows, total] = await qb.getManyAndCount();
  res.json({ data: rows.map((r) => serialize(r)), meta: { total, limit, offset } });
});

receiptsRouter.get('/:id', requirePermission('sales', 'read'), async (req, res) => {
  const row = await dataSource.getRepository(Receipt).findOne({
    where: { id: req.params.id },
    relations: ['allocations'],
  });
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ data: serialize(row, row.allocations) });
});

receiptsRouter.post(
  '/',
  requirePermission('sales', 'post'),
  auditMiddleware({ entity: 'Receipt', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createReceiptSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    let allocSum = 0;
    for (const a of b.allocations) allocSum += parseFloat(a.amount);
    if (Math.abs(allocSum - parseFloat(b.amount)) > 0.0001) {
      res.status(400).json({ error: 'Allocations must sum to receipt amount' });
      return;
    }
    const branchId = resolveBranchId(req);
    try {
      const saved = await runInTransaction(async (manager) => {
        await validateReceiptAllocations(manager, b.customerId, b.allocations);
        const rec = manager.create(Receipt, {
          customerId: b.customerId,
          receiptDate: b.receiptDate.slice(0, 10),
          amount: b.amount,
          paymentMethod: b.paymentMethod,
          reference: b.reference ?? undefined,
          branchId: b.branchId ?? branchId ?? undefined,
          createdBy: req.auth?.userId,
        });
        await manager.save(rec);
        for (const a of b.allocations) {
          await manager.save(
            manager.create(ReceiptAllocation, {
              receiptId: rec.id,
              invoiceId: a.invoiceId,
              amount: a.amount,
            })
          );
        }
        await postReceiptJournal(manager, {
          entryDate: rec.receiptDate,
          reference: `RCPT-${rec.id.slice(0, 8)}`,
          branchId: rec.branchId,
          userId: req.auth?.userId,
          receiptId: rec.id,
          amount: rec.amount,
          paymentMethod: rec.paymentMethod,
        });
        return manager.findOneOrFail(Receipt, { where: { id: rec.id }, relations: ['allocations'] });
      });
      res.status(201).json({ data: serialize(saved, saved.allocations) });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);
