import type { Request } from 'express';
import type { FindOptionsRelations } from 'typeorm';
import type { z } from 'zod';
import { Account, CompanySettings, InvoiceTemplate } from '@tradeflow/db';
import {
  patchCompanyAccountingSettingsSchema,
  patchCompanyProfileSchema,
  patchGeneralSettingsSchema,
  periodLockQuerySchema,
} from '@tradeflow/shared';
import { getValidatedQuery } from '../../../shared/middleware/validate';
import { getUnsettledGrnsForPeriodLock } from '../../purchases/services/grnInvoiceSettlement';
import { ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';
import { serialize, serializeGeneral } from '../serializers/companySettings.serializer';

type PatchGeneralInput = z.infer<typeof patchGeneralSettingsSchema>;
type PatchCompanyProfileInput = z.infer<typeof patchCompanyProfileSchema>;
type PatchAccountingInput = z.infer<typeof patchCompanyAccountingSettingsSchema>;

/** Single-row table; TypeORM 0.3+ requires `where` for findOne — use find + take. */
async function getSingletonCompanySettings(
  relations?: FindOptionsRelations<CompanySettings>
): Promise<CompanySettings | null> {
  const repo = CompanySettings.getRepository();
  const rows = await repo.find({
    take: 1,
    order: { id: 'ASC' },
    ...(relations ? { relations } : {}),
  });
  return rows[0] ?? null;
}

export async function getGeneral(_req: Request): Promise<ControllerResult> {
  const row = await getSingletonCompanySettings();
  if (!row) {
    throw new HttpError(500, { error: 'Company settings not initialized' });
  }
  return ok({ data: serializeGeneral(row) });
}

export async function patchGeneral(_req: Request, b: PatchGeneralInput): Promise<ControllerResult> {
  let row = await getSingletonCompanySettings();
  if (!row) {
    throw new HttpError(500, { error: 'Company settings not initialized' });
  }
  if (b.defaultInvoiceTemplateId !== undefined && b.defaultInvoiceTemplateId !== null) {
    const t = await InvoiceTemplate.findOne({
      where: { id: b.defaultInvoiceTemplateId },
    });
    if (!t) {
      throw new HttpError(400, { error: 'Invoice template not found' });
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
  if (b.financialYearLabelOverride !== undefined)
    row.financialYearLabelOverride = b.financialYearLabelOverride ?? undefined;
  if (b.currencyCode !== undefined) row.currencyCode = b.currencyCode;
  if (b.moneyDecimals !== undefined) row.moneyDecimals = b.moneyDecimals;
  if (b.quantityDecimals !== undefined) row.quantityDecimals = b.quantityDecimals;
  if (b.roundingMode !== undefined) row.roundingMode = b.roundingMode;
  if (b.defaultInvoiceTemplateId !== undefined)
    row.defaultInvoiceTemplateId = b.defaultInvoiceTemplateId ?? undefined;
  if (b.inventoryCostingMethod !== undefined) row.inventoryCostingMethod = b.inventoryCostingMethod;
  await CompanySettings.save(row);
  row = await CompanySettings.findOneOrFail({ where: { id: row.id } });
  return ok({ data: serializeGeneral(row) });
}

export async function getCompanyProfile(_req: Request): Promise<ControllerResult> {
  const row = await getSingletonCompanySettings();
  if (!row) {
    throw new HttpError(500, { error: 'Company settings not initialized' });
  }
  return ok({
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

export async function patchCompanyProfile(
  _req: Request,
  b: PatchCompanyProfileInput
): Promise<ControllerResult> {
  let row = await getSingletonCompanySettings();
  if (!row) {
    throw new HttpError(500, { error: 'Company settings not initialized' });
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
  await CompanySettings.save(row);
  row = await CompanySettings.findOneOrFail({ where: { id: row.id } });
  return ok({
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

export async function getPeriodLockWarnings(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof periodLockQuerySchema>>(req);
  const lockedThrough = q.lockedThrough?.trim();
  if (!lockedThrough || lockedThrough.length !== 10) {
    throw new HttpError(400, { error: 'lockedThrough query param required (YYYY-MM-DD)' });
  }
  const warnings = await getUnsettledGrnsForPeriodLock(lockedThrough);
  return ok({ data: warnings });
}

export async function getAccounting(_req: Request): Promise<ControllerResult> {
  const row = await getSingletonCompanySettings({
    defaultCashAccount: true,
    defaultBankAccount: true,
  });
  if (!row) {
    throw new HttpError(500, { error: 'Company settings not initialized' });
  }
  return ok({
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
}

export async function patchAccounting(_req: Request, b: PatchAccountingInput): Promise<ControllerResult> {
  let row = await getSingletonCompanySettings();
  if (!row) {
    throw new HttpError(500, { error: 'Company settings not initialized' });
  }

  if (b.defaultCashAccountId !== undefined && b.defaultBankAccountId !== undefined) {
    const [cashAcc, bankAcc] = await Promise.all([
      Account.findOne({ where: { id: b.defaultCashAccountId } }),
      Account.findOne({ where: { id: b.defaultBankAccountId } }),
    ]);
    if (!cashAcc || !bankAcc) {
      throw new HttpError(400, { error: 'Account not found' });
    }
    if (cashAcc.type !== 'asset' || bankAcc.type !== 'asset') {
      throw new HttpError(400, { error: 'Cash and bank accounts must be asset accounts' });
    }
    row.defaultCashAccountId = b.defaultCashAccountId;
    row.defaultBankAccountId = b.defaultBankAccountId;
  }

  if (b.periodLockedThrough !== undefined) {
    row.periodLockedThrough = b.periodLockedThrough ?? undefined;
  }
  if (b.journalApprovalThreshold !== undefined) {
    row.journalApprovalThreshold = b.journalApprovalThreshold ?? undefined;
  }

  await CompanySettings.save(row);
  row = await CompanySettings.findOneOrFail({
    where: { id: row.id },
    relations: ['defaultCashAccount', 'defaultBankAccount'],
  });
  return ok({
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
