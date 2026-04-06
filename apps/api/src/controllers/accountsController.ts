import type { Request } from 'express';
import { Brackets } from 'typeorm';
import type { z } from 'zod';
import { createAccountSchema, updateAccountSchema } from '@tradeflow/shared';
import { dataSource, Account, JournalEntry, JournalLine } from '@tradeflow/db';

type CreateAccountInput = z.infer<typeof createAccountSchema>;
type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
import { resolveBranchId } from '../utils/branchScope';
import { created, ok, type ControllerResult } from './controllerResult';
import { HttpError } from './httpError';

function serialize(a: Account) {
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    parentId: a.parentId ?? null,
    isSystem: a.isSystem,
    branchId: a.branchId ?? null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

async function accountHasPostedLines(accountId: string): Promise<boolean> {
  const n = await dataSource
    .getRepository(JournalLine)
    .createQueryBuilder('jl')
    .innerJoin(JournalEntry, 'je', 'je.id = jl.journal_entry_id')
    .where('jl.account_id = :aid', { aid: accountId })
    .andWhere("je.status = 'posted'")
    .getCount();
  return n > 0;
}

export async function listAccounts(req: Request): Promise<ControllerResult> {
  const branchId = resolveBranchId(req);
  const format = (req.query.format as string) || 'flat';

  const qb = dataSource.getRepository(Account).createQueryBuilder('a').orderBy('a.code', 'ASC');
  if (branchId) {
    qb.andWhere(
      new Brackets((w) => {
        w.where('a.branch_id IS NULL').orWhere('a.branch_id = :bid', { bid: branchId });
      })
    );
  }

  const rows = await qb.getMany();

  if (format === 'tree') {
    const byParent = new Map<string | null, Account[]>();
    for (const a of rows) {
      const k = a.parentId ?? null;
      const list = byParent.get(k) ?? [];
      list.push(a);
      byParent.set(k, list);
    }
    function build(pid: string | null): unknown[] {
      return (byParent.get(pid) ?? []).map((a) => ({
        ...serialize(a),
        children: build(a.id),
      }));
    }
    return ok({ data: build(null) });
  }

  return ok({ data: rows.map(serialize) });
}

export async function getAccountBalance(req: Request): Promise<ControllerResult> {
  const branchId = resolveBranchId(req);
  const asOf = ((req.query.asOf as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);

  const acc = await dataSource.getRepository(Account).findOne({ where: { id: req.params.id } });
  if (!acc) {
    throw new HttpError(404, { error: 'Not found' });
  }

  const row = await dataSource.query(
    `
    SELECT
      COALESCE(SUM(jl.debit), 0)::text AS debit,
      COALESCE(SUM(jl.credit), 0)::text AS credit
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      AND je.deleted_at IS NULL
    WHERE jl.account_id = $1
      AND je.status = 'posted'
      AND je.entry_date <= $2::date
      AND ($3::uuid IS NULL OR je.branch_id IS NULL OR je.branch_id = $3::uuid)
    `,
    [req.params.id, asOf, branchId || null]
  );

  const debit = row[0]?.debit ?? '0';
  const credit = row[0]?.credit ?? '0';
  const net = (parseFloat(debit) - parseFloat(credit)).toFixed(4);
  return ok({
    data: {
      accountId: acc.id,
      asOf,
      debitSum: debit,
      creditSum: credit,
      netDebitMinusCredit: net,
    },
  });
}

export async function createAccount(req: Request, body: CreateAccountInput): Promise<ControllerResult> {
  const branchId = resolveBranchId(req);
  const effectiveBranch = body.branchId ?? branchId ?? undefined;

  try {
    if (body.parentId) {
      const parent = await dataSource.getRepository(Account).findOne({ where: { id: body.parentId } });
      if (!parent) {
        throw new HttpError(400, { error: 'Parent account not found' });
      }
      if (parent.branchId && effectiveBranch && parent.branchId !== effectiveBranch) {
        throw new HttpError(400, { error: 'Parent branch mismatch' });
      }
    }

    const codeQb = dataSource
      .getRepository(Account)
      .createQueryBuilder('a')
      .where('a.code = :code', { code: body.code });
    if (effectiveBranch) {
      codeQb.andWhere('a.branch_id = :bid', { bid: effectiveBranch });
    } else {
      codeQb.andWhere('a.branch_id IS NULL');
    }
    if (await codeQb.getOne()) {
      throw new HttpError(409, { error: 'Account code already exists' });
    }

    const a = dataSource.getRepository(Account).create({
      code: body.code,
      name: body.name,
      type: body.type,
      parentId: body.parentId ?? undefined,
      branchId: effectiveBranch,
      isSystem: false,
    });
    const saved = await dataSource.getRepository(Account).save(a);
    return created({ data: serialize(saved) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, { error: (e as Error).message });
  }
}

export async function updateAccount(req: Request, body: UpdateAccountInput): Promise<ControllerResult> {
  const acc = await dataSource.getRepository(Account).findOne({ where: { id: req.params.id } });
  if (!acc) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (acc.isSystem) {
    throw new HttpError(400, { error: 'System accounts cannot be edited' });
  }
  if (await accountHasPostedLines(acc.id)) {
    throw new HttpError(400, { error: 'Cannot edit account with posted journal lines' });
  }

  if (body.code !== undefined) acc.code = body.code;
  if (body.name !== undefined) acc.name = body.name;
  if (body.type !== undefined) acc.type = body.type;
  if (body.parentId !== undefined) acc.parentId = body.parentId ?? undefined;

  try {
    const saved = await dataSource.getRepository(Account).save(acc);
    return ok({ data: serialize(saved) });
  } catch (e) {
    throw new HttpError(400, { error: (e as Error).message });
  }
}
