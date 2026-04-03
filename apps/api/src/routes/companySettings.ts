import { Router } from 'express';
import { dataSource, Account, CompanySettings } from '@tradeflow/db';
import { updateCompanyAccountingSettingsSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';

export const companySettingsRouter = Router();
companySettingsRouter.use(authMiddleware, loadUser);

function serialize(cs: CompanySettings) {
  return {
    id: cs.id,
    defaultCashAccountId: cs.defaultCashAccountId,
    defaultBankAccountId: cs.defaultBankAccountId,
    updatedAt: cs.updatedAt,
  };
}

companySettingsRouter.get('/accounting', requirePermission('accounting', 'read'), async (_req, res) => {
  const row = await dataSource.getRepository(CompanySettings).findOne({
    order: { id: 'ASC' },
    relations: ['defaultCashAccount', 'defaultBankAccount'],
  });
  if (!row) {
    res.status(500).json({ error: 'Company settings not initialized' });
    return;
  }
  res.json({
    data: {
      ...serialize(row),
      defaultCashAccount: {
        id: row.defaultCashAccount.id,
        code: row.defaultCashAccount.code,
        name: row.defaultCashAccount.name,
        type: row.defaultCashAccount.type,
      },
      defaultBankAccount: {
        id: row.defaultBankAccount.id,
        code: row.defaultBankAccount.code,
        name: row.defaultBankAccount.name,
        type: row.defaultBankAccount.type,
      },
    },
  });
});

companySettingsRouter.patch(
  '/accounting',
  requirePermission('accounting', 'write'),
  auditMiddleware({ entity: 'CompanySettings', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = updateCompanyAccountingSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const { defaultCashAccountId, defaultBankAccountId } = parsed.data;

    const [cashAcc, bankAcc] = await Promise.all([
      dataSource.getRepository(Account).findOne({ where: { id: defaultCashAccountId } }),
      dataSource.getRepository(Account).findOne({ where: { id: defaultBankAccountId } }),
    ]);
    if (!cashAcc || !bankAcc) {
      res.status(400).json({ error: 'Account not found' });
      return;
    }
    if (cashAcc.type !== 'asset' || bankAcc.type !== 'asset') {
      res.status(400).json({ error: 'Cash and bank accounts must be asset accounts' });
      return;
    }

    let row = await dataSource.getRepository(CompanySettings).findOne({ order: { id: 'ASC' } });
    if (!row) {
      res.status(500).json({ error: 'Company settings not initialized' });
      return;
    }
    row.defaultCashAccountId = defaultCashAccountId;
    row.defaultBankAccountId = defaultBankAccountId;
    await dataSource.getRepository(CompanySettings).save(row);
    row = await dataSource.getRepository(CompanySettings).findOneOrFail({
      where: { id: row.id },
      relations: ['defaultCashAccount', 'defaultBankAccount'],
    });
    res.json({
      data: {
        ...serialize(row),
        defaultCashAccount: {
          id: row.defaultCashAccount.id,
          code: row.defaultCashAccount.code,
          name: row.defaultCashAccount.name,
        },
        defaultBankAccount: {
          id: row.defaultBankAccount.id,
          code: row.defaultBankAccount.code,
          name: row.defaultBankAccount.name,
        },
      },
    });
  }
);
