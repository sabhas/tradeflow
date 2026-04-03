import { Router } from 'express';
import { dataSource, Account, CompanySettings, InvoiceTemplate } from '@tradeflow/db';
import {
  patchCompanyProfileSchema,
  patchGeneralSettingsSchema,
  updateCompanyAccountingSettingsSchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { computeFinancialYearLabel } from '../utils/financialYear';

export const companySettingsRouter = Router();
companySettingsRouter.use(authMiddleware, loadUser);

function serializeGeneral(cs: CompanySettings) {
  return {
    id: cs.id,
    companyName: cs.companyName,
    legalName: cs.legalName ?? null,
    addressLine1: cs.addressLine1 ?? null,
    addressLine2: cs.addressLine2 ?? null,
    city: cs.city ?? null,
    state: cs.state ?? null,
    postalCode: cs.postalCode ?? null,
    country: cs.country ?? null,
    phone: cs.phone ?? null,
    email: cs.email ?? null,
    taxRegistrationNumber: cs.taxRegistrationNumber ?? null,
    logoUrl: cs.logoUrl ?? null,
    financialYearStartMonth: cs.financialYearStartMonth,
    financialYearLabelOverride: cs.financialYearLabelOverride ?? null,
    currentFinancialYearLabel: computeFinancialYearLabel(
      new Date(),
      cs.financialYearStartMonth,
      cs.financialYearLabelOverride
    ),
    currencyCode: cs.currencyCode,
    moneyDecimals: cs.moneyDecimals,
    quantityDecimals: cs.quantityDecimals,
    roundingMode: cs.roundingMode,
    inventoryCostingMethod: cs.inventoryCostingMethod ?? 'fifo',
    defaultInvoiceTemplateId: cs.defaultInvoiceTemplateId ?? null,
    defaultCashAccountId: cs.defaultCashAccountId,
    defaultBankAccountId: cs.defaultBankAccountId,
    updatedAt: cs.updatedAt,
  };
}

companySettingsRouter.get('/', requirePermission('settings', 'read'), async (_req, res) => {
  const row = await dataSource.getRepository(CompanySettings).findOne({ order: { id: 'ASC' } });
  if (!row) {
    res.status(500).json({ error: 'Company settings not initialized' });
    return;
  }
  res.json({ data: serializeGeneral(row) });
});

companySettingsRouter.patch(
  '/',
  requirePermission('settings', 'write'),
  auditMiddleware({ entity: 'CompanySettings', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = patchGeneralSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    let row = await dataSource.getRepository(CompanySettings).findOne({ order: { id: 'ASC' } });
    if (!row) {
      res.status(500).json({ error: 'Company settings not initialized' });
      return;
    }
    if (b.defaultInvoiceTemplateId !== undefined && b.defaultInvoiceTemplateId !== null) {
      const t = await dataSource.getRepository(InvoiceTemplate).findOne({
        where: { id: b.defaultInvoiceTemplateId },
      });
      if (!t) {
        res.status(400).json({ error: 'Invoice template not found' });
        return;
      }
    }
    if (b.companyName !== undefined) row.companyName = b.companyName;
    if (b.legalName !== undefined) row.legalName = b.legalName ?? undefined;
    if (b.addressLine1 !== undefined) row.addressLine1 = b.addressLine1 ?? undefined;
    if (b.addressLine2 !== undefined) row.addressLine2 = b.addressLine2 ?? undefined;
    if (b.city !== undefined) row.city = b.city ?? undefined;
    if (b.state !== undefined) row.state = b.state ?? undefined;
    if (b.postalCode !== undefined) row.postalCode = b.postalCode ?? undefined;
    if (b.country !== undefined) row.country = b.country ?? undefined;
    if (b.phone !== undefined) row.phone = b.phone ?? undefined;
    if (b.email !== undefined) row.email = b.email ?? undefined;
    if (b.taxRegistrationNumber !== undefined) row.taxRegistrationNumber = b.taxRegistrationNumber ?? undefined;
    if (b.logoUrl !== undefined) row.logoUrl = b.logoUrl ?? undefined;
    if (b.financialYearStartMonth !== undefined) row.financialYearStartMonth = b.financialYearStartMonth;
    if (b.financialYearLabelOverride !== undefined) row.financialYearLabelOverride = b.financialYearLabelOverride ?? undefined;
    if (b.currencyCode !== undefined) row.currencyCode = b.currencyCode;
    if (b.moneyDecimals !== undefined) row.moneyDecimals = b.moneyDecimals;
    if (b.quantityDecimals !== undefined) row.quantityDecimals = b.quantityDecimals;
    if (b.roundingMode !== undefined) row.roundingMode = b.roundingMode;
    if (b.defaultInvoiceTemplateId !== undefined) row.defaultInvoiceTemplateId = b.defaultInvoiceTemplateId ?? undefined;
    if (b.inventoryCostingMethod !== undefined) row.inventoryCostingMethod = b.inventoryCostingMethod;
    await dataSource.getRepository(CompanySettings).save(row);
    row = await dataSource.getRepository(CompanySettings).findOneOrFail({ order: { id: 'ASC' } });
    res.json({ data: serializeGeneral(row) });
  }
);

companySettingsRouter.get('/company', requirePermission('settings', 'read'), async (_req, res) => {
  const row = await dataSource.getRepository(CompanySettings).findOne({ order: { id: 'ASC' } });
  if (!row) {
    res.status(500).json({ error: 'Company settings not initialized' });
    return;
  }
  res.json({
    data: {
      companyName: row.companyName,
      legalName: row.legalName ?? null,
      addressLine1: row.addressLine1 ?? null,
      addressLine2: row.addressLine2 ?? null,
      city: row.city ?? null,
      state: row.state ?? null,
      postalCode: row.postalCode ?? null,
      country: row.country ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      taxRegistrationNumber: row.taxRegistrationNumber ?? null,
      logoUrl: row.logoUrl ?? null,
    },
  });
});

companySettingsRouter.patch(
  '/company',
  requirePermission('settings', 'write'),
  auditMiddleware({ entity: 'CompanySettings', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = patchCompanyProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    let row = await dataSource.getRepository(CompanySettings).findOne({ order: { id: 'ASC' } });
    if (!row) {
      res.status(500).json({ error: 'Company settings not initialized' });
      return;
    }
    if (b.companyName !== undefined) row.companyName = b.companyName;
    if (b.legalName !== undefined) row.legalName = b.legalName ?? undefined;
    if (b.addressLine1 !== undefined) row.addressLine1 = b.addressLine1 ?? undefined;
    if (b.addressLine2 !== undefined) row.addressLine2 = b.addressLine2 ?? undefined;
    if (b.city !== undefined) row.city = b.city ?? undefined;
    if (b.state !== undefined) row.state = b.state ?? undefined;
    if (b.postalCode !== undefined) row.postalCode = b.postalCode ?? undefined;
    if (b.country !== undefined) row.country = b.country ?? undefined;
    if (b.phone !== undefined) row.phone = b.phone ?? undefined;
    if (b.email !== undefined) row.email = b.email ?? undefined;
    if (b.taxRegistrationNumber !== undefined) row.taxRegistrationNumber = b.taxRegistrationNumber ?? undefined;
    if (b.logoUrl !== undefined) row.logoUrl = b.logoUrl ?? undefined;
    await dataSource.getRepository(CompanySettings).save(row);
    row = await dataSource.getRepository(CompanySettings).findOneOrFail({ order: { id: 'ASC' } });
    res.json({
      data: {
        companyName: row.companyName,
        legalName: row.legalName ?? null,
        addressLine1: row.addressLine1 ?? null,
        addressLine2: row.addressLine2 ?? null,
        city: row.city ?? null,
        state: row.state ?? null,
        postalCode: row.postalCode ?? null,
        country: row.country ?? null,
        phone: row.phone ?? null,
        email: row.email ?? null,
        taxRegistrationNumber: row.taxRegistrationNumber ?? null,
        logoUrl: row.logoUrl ?? null,
      },
    });
  }
);

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
