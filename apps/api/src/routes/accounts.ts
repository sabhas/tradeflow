import { Router } from 'express';
import { Brackets } from 'typeorm';
import { dataSource, Account, JournalEntry, JournalLine } from '@tradeflow/db';
import { createAccountSchema, updateAccountSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';

export const accountsRouter = Router();
accountsRouter.use(authMiddleware, loadUser);

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

accountsRouter.get('/', requirePermission('accounting', 'read'), async (req, res) => {
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
    res.json({ data: build(null) });
    return;
  }

  res.json({ data: rows.map(serialize) });
});

accountsRouter.get('/:id/balance', requirePermission('accounting', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const asOf = ((req.query.asOf as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);

  const acc = await dataSource.getRepository(Account).findOne({ where: { id: req.params.id } });
  if (!acc) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const row = await dataSource.query(
    `
    SELECT
      COALESCE(SUM(jl.debit), 0)::text AS debit,
      COALESCE(SUM(jl.credit), 0)::text AS credit
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
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
  res.json({
    data: {
      accountId: acc.id,
      asOf,
      debitSum: debit,
      creditSum: credit,
      netDebitMinusCredit: net,
    },
  });
});

accountsRouter.post(
  '/',
  requirePermission('accounting', 'write'),
  auditMiddleware({ entity: 'Account', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const branchId = resolveBranchId(req);
    const effectiveBranch = b.branchId ?? branchId ?? undefined;

    try {
      if (b.parentId) {
        const parent = await dataSource.getRepository(Account).findOne({ where: { id: b.parentId } });
        if (!parent) {
          res.status(400).json({ error: 'Parent account not found' });
          return;
        }
        if (parent.branchId && effectiveBranch && parent.branchId !== effectiveBranch) {
          res.status(400).json({ error: 'Parent branch mismatch' });
          return;
        }
      }

      const codeQb = dataSource
        .getRepository(Account)
        .createQueryBuilder('a')
        .where('a.code = :code', { code: b.code });
      if (effectiveBranch) {
        codeQb.andWhere('a.branch_id = :bid', { bid: effectiveBranch });
      } else {
        codeQb.andWhere('a.branch_id IS NULL');
      }
      if (await codeQb.getOne()) {
        res.status(409).json({ error: 'Account code already exists' });
        return;
      }

      const a = dataSource.getRepository(Account).create({
        code: b.code,
        name: b.name,
        type: b.type,
        parentId: b.parentId ?? undefined,
        branchId: effectiveBranch,
        isSystem: false,
      });
      const saved = await dataSource.getRepository(Account).save(a);
      res.status(201).json({ data: serialize(saved) });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);

accountsRouter.patch(
  '/:id',
  requirePermission('accounting', 'write'),
  auditMiddleware({
    entity: 'Account',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = updateAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const acc = await dataSource.getRepository(Account).findOne({ where: { id: req.params.id } });
    if (!acc) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (acc.isSystem) {
      res.status(400).json({ error: 'System accounts cannot be edited' });
      return;
    }
    if (await accountHasPostedLines(acc.id)) {
      res.status(400).json({ error: 'Cannot edit account with posted journal lines' });
      return;
    }

    if (b.code !== undefined) acc.code = b.code;
    if (b.name !== undefined) acc.name = b.name;
    if (b.type !== undefined) acc.type = b.type;
    if (b.parentId !== undefined) acc.parentId = b.parentId ?? undefined;

    try {
      const saved = await dataSource.getRepository(Account).save(acc);
      res.json({ data: serialize(saved) });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);
