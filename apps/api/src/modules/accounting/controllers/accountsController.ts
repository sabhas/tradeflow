import type { Request } from 'express';
import type { z } from 'zod';
import {
  accountBalanceQuerySchema,
  createAccountSchema,
  listAccountsQuerySchema,
  updateAccountSchema,
} from '@tradeflow/shared';
import { getValidatedQuery } from '../../../shared/middleware/validate';
import { dataSource, Account, JournalEntry, JournalLine } from '@tradeflow/db';

type CreateAccountInput = z.infer<typeof createAccountSchema>;
type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
import { created, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';
import { serializeAccount } from '../serializers/account.serializer';

async function accountHasPostedLines(accountId: string): Promise<boolean> {
  const n = await JournalLine.createQueryBuilder('jl')
    .innerJoin(JournalEntry, 'je', 'je.id = jl.journal_entry_id')
    .where('jl.account_id = :aid', { aid: accountId })
    .andWhere("je.status = 'posted'")
    .getCount();
  return n > 0;
}

export async function listAccounts(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof listAccountsQuerySchema>>(req);
  const format = q.format ?? 'flat';

  const qb = Account.createQueryBuilder('a').orderBy('a.code', 'ASC');

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
        ...serializeAccount(a),
        children: build(a.id),
      }));
    }
    return ok({ data: build(null) });
  }

  return ok({ data: rows.map(serializeAccount) });
}

export async function getAccountBalance(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof accountBalanceQuerySchema>>(req);
  const asOf = (q.asOf || new Date().toISOString().slice(0, 10)).slice(0, 10);

  const acc = await Account.findOne({ where: { id: req.params.id } });
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
    `,
    [req.params.id, asOf]
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
  if (body.parentId) {
    const parent = await Account.findOne({ where: { id: body.parentId } });
    if (!parent) {
      throw new HttpError(400, { error: 'Parent account not found' });
    }
  }

  const codeQb = Account.createQueryBuilder('a').where('a.code = :code', { code: body.code });
  if (await codeQb.getOne()) {
    throw new HttpError(409, { error: 'Account code already exists' });
  }

  const a = Account.create({
    code: body.code,
    name: body.name,
    type: body.type,
    parentId: body.parentId ?? undefined,
    isSystem: false,
  });
  const saved = await Account.save(a);
  return created({ data: serializeAccount(saved) });
}

export async function updateAccount(req: Request, body: UpdateAccountInput): Promise<ControllerResult> {
  const acc = await Account.findOne({ where: { id: req.params.id } });
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

  const saved = await Account.save(acc);
  return ok({ data: serializeAccount(saved) });
}
