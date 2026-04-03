import { Router } from 'express';
import { EntityManager } from 'typeorm';
import { dataSource, JournalEntry, JournalLine } from '@tradeflow/db';
import { createJournalEntrySchema, updateJournalEntrySchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';
import { parseDecimalStrict } from '../utils/decimal';
import { runInTransaction } from '../services/inventoryService';

export const journalEntriesRouter = Router();
journalEntriesRouter.use(authMiddleware, loadUser);

function assertBalanced(lines: Array<{ debit: string; credit: string }>): void {
  let d = 0;
  let c = 0;
  for (const l of lines) {
    d += parseFloat(l.debit || '0');
    c += parseFloat(l.credit || '0');
  }
  if (Math.abs(d - c) > 0.0001) throw new Error('Journal must balance (sum debits = sum credits)');
}

function serializeEntry(e: JournalEntry, lines?: JournalLine[]) {
  return {
    id: e.id,
    entryDate: e.entryDate,
    reference: e.reference ?? null,
    description: e.description ?? null,
    status: e.status,
    sourceType: e.sourceType ?? null,
    sourceId: e.sourceId ?? null,
    branchId: e.branchId ?? null,
    createdBy: e.createdBy ?? null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    lines:
      lines?.map((l) => ({
        id: l.id,
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
      })) ?? undefined,
  };
}

async function replaceLines(
  manager: EntityManager,
  entryId: string,
  lines: Array<{ accountId: string; debit: string; credit: string }>
) {
  await manager.getRepository(JournalLine).delete({ journalEntryId: entryId });
  for (const l of lines) {
    await manager.save(
      manager.create(JournalLine, {
        journalEntryId: entryId,
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
      })
    );
  }
}

function normalizeLines(
  raw: Array<{ accountId: string; debit: string; credit: string }>
): Array<{ accountId: string; debit: string; credit: string }> {
  return raw.map((l) => {
    const debit = parseDecimalStrict(l.debit);
    const credit = parseDecimalStrict(l.credit);
    if (parseFloat(debit) > 0 && parseFloat(credit) > 0) {
      throw new Error('Each line must have either debit or credit, not both');
    }
    if (parseFloat(debit) <= 0 && parseFloat(credit) <= 0) {
      throw new Error('Each line must have a non-zero debit or credit');
    }
    return { accountId: l.accountId, debit, credit };
  });
}

journalEntriesRouter.get('/', requirePermission('accounting', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const { limit, offset } = getPagination(req);
  const status = (req.query.status as string | undefined)?.trim();
  const dateFrom = (req.query.dateFrom as string | undefined)?.slice(0, 10);
  const dateTo = (req.query.dateTo as string | undefined)?.slice(0, 10);

  const qb = dataSource
    .getRepository(JournalEntry)
    .createQueryBuilder('je')
    .orderBy('je.entry_date', 'DESC')
    .addOrderBy('je.created_at', 'DESC')
    .take(limit)
    .skip(offset);

  if (branchId) {
    qb.andWhere('(je.branch_id IS NULL OR je.branch_id = :bid)', { bid: branchId });
  }
  if (status) qb.andWhere('je.status = :st', { st: status });
  if (dateFrom) qb.andWhere('je.entry_date >= :df', { df: dateFrom });
  if (dateTo) qb.andWhere('je.entry_date <= :dt', { dt: dateTo });

  const [rows, total] = await qb.getManyAndCount();
  res.json({ data: rows.map((r) => serializeEntry(r)), meta: { total, limit, offset } });
});

journalEntriesRouter.get('/:id', requirePermission('accounting', 'read'), async (req, res) => {
  const row = await dataSource.getRepository(JournalEntry).findOne({
    where: { id: req.params.id },
    relations: ['lines', 'lines.account'],
  });
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ data: serializeEntry(row, row.lines) });
});

journalEntriesRouter.post(
  '/',
  requirePermission('accounting', 'write'),
  auditMiddleware({ entity: 'JournalEntry', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createJournalEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const branchId = resolveBranchId(req);
    try {
      const lines = normalizeLines(b.lines);
      assertBalanced(lines);

      const full = await runInTransaction(async (manager) => {
        const entry = manager.create(JournalEntry, {
          entryDate: b.entryDate.slice(0, 10),
          reference: b.reference ?? undefined,
          description: b.description ?? undefined,
          status: 'draft',
          branchId: b.branchId ?? branchId ?? undefined,
          createdBy: req.auth?.userId,
        });
        await manager.save(entry);
        await replaceLines(manager, entry.id, lines);
        return manager.findOneOrFail(JournalEntry, {
          where: { id: entry.id },
          relations: ['lines'],
        });
      });
      res.status(201).json({ data: serializeEntry(full, full.lines) });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);

journalEntriesRouter.patch(
  '/:id',
  requirePermission('accounting', 'write'),
  auditMiddleware({
    entity: 'JournalEntry',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = updateJournalEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const row = await dataSource.getRepository(JournalEntry).findOne({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (row.status !== 'draft') {
      res.status(400).json({ error: 'Only draft entries can be edited' });
      return;
    }
    if (row.sourceType) {
      res.status(400).json({ error: 'System-sourced entries cannot be edited here' });
      return;
    }

    try {
      const full = await runInTransaction(async (manager) => {
        const cur = await manager.findOne(JournalEntry, { where: { id: row.id } });
        if (!cur) throw new Error('Not found');
        if (b.entryDate !== undefined) cur.entryDate = b.entryDate.slice(0, 10);
        if (b.reference !== undefined) cur.reference = b.reference ?? undefined;
        if (b.description !== undefined) cur.description = b.description ?? undefined;
        if (b.branchId !== undefined) cur.branchId = b.branchId ?? undefined;

        if (b.lines) {
          const lines = normalizeLines(b.lines);
          assertBalanced(lines);
          await manager.save(cur);
          await replaceLines(manager, cur.id, lines);
        } else {
          await manager.save(cur);
        }

        return manager.findOneOrFail(JournalEntry, {
          where: { id: row.id },
          relations: ['lines'],
        });
      });
      res.json({ data: serializeEntry(full, full.lines) });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);

journalEntriesRouter.delete('/:id', requirePermission('accounting', 'write'), async (req, res) => {
  const row = await dataSource.getRepository(JournalEntry).findOne({ where: { id: req.params.id } });
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (row.status !== 'draft') {
    res.status(400).json({ error: 'Only draft entries can be deleted' });
    return;
  }
  if (row.sourceType) {
    res.status(400).json({ error: 'System-sourced entries cannot be deleted here' });
    return;
  }
  await dataSource.getRepository(JournalEntry).remove(row);
  res.status(204).send();
});

journalEntriesRouter.post('/:id/post', requirePermission('accounting', 'write'), async (req, res) => {
  const row = await dataSource.getRepository(JournalEntry).findOne({
    where: { id: req.params.id },
    relations: ['lines'],
  });
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (row.status === 'posted') {
    res.status(400).json({ error: 'Already posted' });
    return;
  }
  if (!row.lines?.length) {
    res.status(400).json({ error: 'Entry has no lines' });
    return;
  }

  const lines = row.lines.map((l) => ({
    debit: l.debit,
    credit: l.credit,
  }));
  try {
    assertBalanced(lines);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }

  row.status = 'posted';
  await dataSource.getRepository(JournalEntry).save(row);
  const full = await dataSource.getRepository(JournalEntry).findOneOrFail({
    where: { id: row.id },
    relations: ['lines'],
  });
  res.json({ data: serializeEntry(full, full.lines) });
});
