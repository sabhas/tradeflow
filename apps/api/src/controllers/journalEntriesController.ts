import type { Request } from 'express';
import { EntityManager, IsNull } from 'typeorm';
import type { z } from 'zod';
import { JournalEntry, JournalLine } from '@tradeflow/db';
import { createJournalEntrySchema, updateJournalEntrySchema } from '@tradeflow/shared';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';
import { parseDecimalStrict } from '../utils/decimal';
import { runInTransaction } from '../services/inventoryService';
import { assertDateNotPeriodLocked } from '../services/periodLock';
import { created, ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>;
type UpdateJournalEntryInput = z.infer<typeof updateJournalEntrySchema>;

function assertBalanced(lines: Array<{ debit: string; credit: string }>): void {
  let d = 0;
  let c = 0;
  for (const l of lines) {
    d += parseFloat(l.debit || '0');
    c += parseFloat(l.credit || '0');
  }
  if (Math.abs(d - c) > 0.0001) throw new Error('Journal must balance (sum debits = sum credits)');
}

export function serializeJournalEntry(e: JournalEntry, lines?: JournalLine[]) {
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
    deletedAt: e.deletedAt ?? null,
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

export async function listJournalEntries(req: Request): Promise<ControllerResult> {
  const branchId = resolveBranchId(req);
  const { limit, offset } = getPagination(req);
  const status = (req.query.status as string | undefined)?.trim();
  const dateFrom = (req.query.dateFrom as string | undefined)?.slice(0, 10);
  const dateTo = (req.query.dateTo as string | undefined)?.slice(0, 10);

  const qb = JournalEntry
    .createQueryBuilder('je')
    .where('je.deleted_at IS NULL')
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
  return ok({ data: rows.map((r) => serializeJournalEntry(r)), meta: { total, limit, offset } });
}

export async function getJournalEntry(req: Request): Promise<ControllerResult> {
  const row = await JournalEntry.findOne({
    where: { id: req.params.id, deletedAt: IsNull() },
    relations: ['lines', 'lines.account'],
  });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  return ok({ data: serializeJournalEntry(row, row.lines) });
}

export async function createJournalEntry(req: Request, body: CreateJournalEntryInput): Promise<ControllerResult> {
  const b = body;
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
        where: { id: entry.id, deletedAt: IsNull() },
        relations: ['lines'],
      });
    });
    return created({ data: serializeJournalEntry(full, full.lines) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, { error: (e as Error).message });
  }
}

export async function updateJournalEntry(req: Request, body: UpdateJournalEntryInput): Promise<ControllerResult> {
  const b = body;
  const row = await JournalEntry
    .findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (row.status !== 'draft') {
    throw new HttpError(400, { error: 'Only draft entries can be edited' });
  }
  if (row.sourceType) {
    throw new HttpError(400, { error: 'System-sourced entries cannot be edited here' });
  }

  try {
    const full = await runInTransaction(async (manager) => {
      const cur = await manager.findOne(JournalEntry, {
        where: { id: row.id, deletedAt: IsNull() },
      });
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
        where: { id: row.id, deletedAt: IsNull() },
        relations: ['lines'],
      });
    });
    return ok({ data: serializeJournalEntry(full, full.lines) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, { error: (e as Error).message });
  }
}

export async function deleteJournalEntry(req: Request): Promise<ControllerResult> {
  const row = await JournalEntry.findOne({
    where: { id: req.params.id, deletedAt: IsNull() },
  });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (row.status !== 'draft') {
    throw new HttpError(400, { error: 'Only draft entries can be deleted' });
  }
  if (row.sourceType) {
    throw new HttpError(400, { error: 'System-sourced entries cannot be deleted here' });
  }
  row.deletedAt = new Date();
  await JournalEntry.save(row);
  return ok({ data: { id: row.id, deleted: true } });
}

export async function postJournalEntry(req: Request): Promise<ControllerResult> {
  const row = await JournalEntry.findOne({
    where: { id: req.params.id, deletedAt: IsNull() },
    relations: ['lines'],
  });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (row.status === 'posted') {
    throw new HttpError(400, { error: 'Already posted' });
  }
  if (!row.lines?.length) {
    throw new HttpError(400, { error: 'Entry has no lines' });
  }

  const lines = row.lines.map((l) => ({
    debit: l.debit,
    credit: l.credit,
  }));
  try {
    assertBalanced(lines);
  } catch (e) {
    throw new HttpError(400, { error: (e as Error).message });
  }

  try {
    const full = await runInTransaction(async (manager) => {
      const cur = await manager.findOne(JournalEntry, {
        where: { id: row.id, deletedAt: IsNull() },
        relations: ['lines'],
      });
      if (!cur || cur.status !== 'draft') throw new Error('Entry state changed');
      await assertDateNotPeriodLocked(manager, cur.entryDate);
      cur.status = 'posted';
      await manager.save(cur);
      return manager.findOneOrFail(JournalEntry, {
        where: { id: cur.id, deletedAt: IsNull() },
        relations: ['lines'],
      });
    });
    return ok({ data: serializeJournalEntry(full, full.lines) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, { error: (e as Error).message });
  }
}

export async function reverseJournalEntry(req: Request, entryDate?: string): Promise<ControllerResult> {
  const original = await JournalEntry.findOne({
    where: { id: req.params.id, deletedAt: IsNull() },
    relations: ['lines'],
  });
  if (!original) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (original.status !== 'posted') {
    throw new HttpError(400, { error: 'Only posted entries can be reversed' });
  }
  if (!original.lines?.length) {
    throw new HttpError(400, { error: 'Entry has no lines' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const reversalDate = (entryDate ?? today).slice(0, 10);

  try {
    const full = await runInTransaction(async (manager) => {
      await assertDateNotPeriodLocked(manager, reversalDate);

      const revLines = original.lines.map((l) => ({
        accountId: l.accountId,
        debit: l.credit,
        credit: l.debit,
      }));
      assertBalanced(revLines);

      const ref = original.reference?.trim() || original.id.slice(0, 8);
      const entry = manager.create(JournalEntry, {
        entryDate: reversalDate,
        reference: `REV-${ref}`.slice(0, 120),
        description: `Reversal of journal ${ref}`,
        status: 'posted',
        sourceType: 'journal_reversal',
        sourceId: original.id,
        branchId: original.branchId ?? undefined,
        createdBy: req.auth?.userId,
      });
      await manager.save(entry);
      await replaceLines(manager, entry.id, revLines);
      return manager.findOneOrFail(JournalEntry, {
        where: { id: entry.id, deletedAt: IsNull() },
        relations: ['lines'],
      });
    });
    return created({ data: serializeJournalEntry(full, full.lines) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, { error: (e as Error).message });
  }
}

export async function getJournalEntrySnapshotForAudit(id: string) {
  const row = await JournalEntry.findOne({
    where: { id, deletedAt: IsNull() },
    relations: ['lines'],
  });
  return row ? serializeJournalEntry(row, row.lines) : undefined;
}
