import { z } from 'zod';

export const roundingModeSchema = z.enum(['half_up', 'half_down', 'down', 'up']);

export const invoiceTemplateConfigSchema = z.object({
  showLogo: z.boolean().optional(),
  showLegalName: z.boolean().optional(),
  showTaxNumber: z.boolean().optional(),
  showPaymentTerms: z.boolean().optional(),
  showNotes: z.boolean().optional(),
});

export const patchGeneralSettingsSchema = z
  .object({
    companyName: z.string().min(1).max(255).optional(),
    legalName: z.union([z.string().max(255), z.null()]).optional(),
    addressLine1: z.union([z.string().max(255), z.null()]).optional(),
    addressLine2: z.union([z.string().max(255), z.null()]).optional(),
    city: z.union([z.string().max(128), z.null()]).optional(),
    state: z.union([z.string().max(128), z.null()]).optional(),
    postalCode: z.union([z.string().max(32), z.null()]).optional(),
    country: z.union([z.string().max(128), z.null()]).optional(),
    phone: z.union([z.string().max(64), z.null()]).optional(),
    email: z.union([z.string().max(255), z.null()]).optional(),
    taxRegistrationNumber: z.union([z.string().max(128), z.null()]).optional(),
    logoUrl: z.union([z.string().max(2048), z.null()]).optional(),
    financialYearStartMonth: z.number().int().min(1).max(12).optional(),
    financialYearLabelOverride: z.union([z.string().max(64), z.null()]).optional(),
    currencyCode: z.string().min(3).max(3).optional(),
    moneyDecimals: z.number().int().min(0).max(6).optional(),
    quantityDecimals: z.number().int().min(0).max(6).optional(),
    roundingMode: roundingModeSchema.optional(),
    defaultInvoiceTemplateId: z.union([z.string().uuid(), z.null()]).optional(),
  })
  .strict();

export const patchCompanyProfileSchema = z
  .object({
    companyName: z.string().min(1).max(255).optional(),
    legalName: z.union([z.string().max(255), z.null()]).optional(),
    addressLine1: z.union([z.string().max(255), z.null()]).optional(),
    addressLine2: z.union([z.string().max(255), z.null()]).optional(),
    city: z.union([z.string().max(128), z.null()]).optional(),
    state: z.union([z.string().max(128), z.null()]).optional(),
    postalCode: z.union([z.string().max(32), z.null()]).optional(),
    country: z.union([z.string().max(128), z.null()]).optional(),
    phone: z.union([z.string().max(64), z.null()]).optional(),
    email: z.union([z.string().max(255), z.null()]).optional(),
    taxRegistrationNumber: z.union([z.string().max(128), z.null()]).optional(),
    logoUrl: z.union([z.string().max(2048), z.null()]).optional(),
  })
  .strict();

export const createInvoiceTemplateSchema = z.object({
  name: z.string().min(1).max(128),
  config: invoiceTemplateConfigSchema,
  branchId: z.union([z.string().uuid(), z.null()]).optional(),
});

export const updateInvoiceTemplateSchema = createInvoiceTemplateSchema.partial();
