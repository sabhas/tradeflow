import { CompanySettings } from '@tradeflow/db';
import { computeFinancialYearLabel } from '../../../shared/utils/financialYear';
import { nullable } from '../../../shared/utils/serializeHelpers';

export function serializeGeneral(cs: CompanySettings) {
  return {
    id: cs.id,
    companyName: cs.companyName,
    legalName: nullable(cs.legalName),
    addressLine1: nullable(cs.addressLine1),
    addressLine2: nullable(cs.addressLine2),
    city: nullable(cs.city),
    state: nullable(cs.state),
    postalCode: nullable(cs.postalCode),
    country: nullable(cs.country),
    phone: nullable(cs.phone),
    email: nullable(cs.email),
    taxRegistrationNumber: nullable(cs.taxRegistrationNumber),
    logoUrl: nullable(cs.logoUrl),
    financialYearStartMonth: cs.financialYearStartMonth,
    financialYearLabelOverride: nullable(cs.financialYearLabelOverride),
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
    defaultInvoiceTemplateId: nullable(cs.defaultInvoiceTemplateId),
    defaultCashAccountId: cs.defaultCashAccountId,
    defaultBankAccountId: cs.defaultBankAccountId,
    updatedAt: cs.updatedAt,
  };
}

export function serialize(cs: CompanySettings) {
  return {
    id: cs.id,
    defaultCashAccountId: cs.defaultCashAccountId,
    defaultBankAccountId: cs.defaultBankAccountId,
    periodLockedThrough: nullable(cs.periodLockedThrough),
    journalApprovalThreshold: nullable(cs.journalApprovalThreshold),
    updatedAt: cs.updatedAt,
  };
}
