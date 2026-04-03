import { z } from 'zod';

const accountType = z.enum(['asset', 'liability', 'equity', 'income', 'expense']);

export const createAccountSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(255),
  type: accountType,
  parentId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
});

export const updateAccountSchema = z.object({
  code: z.string().min(1).max(32).optional(),
  name: z.string().min(1).max(255).optional(),
  type: accountType.optional(),
  parentId: z.string().uuid().optional().nullable(),
});

export const journalLineInputSchema = z.object({
  accountId: z.string().uuid(),
  debit: z.string().regex(/^-?\d+(\.\d+)?$/),
  credit: z.string().regex(/^-?\d+(\.\d+)?$/),
});

export const createJournalEntrySchema = z.object({
  entryDate: z.string().min(10),
  reference: z.string().max(128).optional().nullable(),
  description: z.string().optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
  lines: z.array(journalLineInputSchema).min(2),
});

export const updateJournalEntrySchema = createJournalEntrySchema.partial().extend({
  lines: z.array(journalLineInputSchema).min(2).optional(),
});

/** Legacy: both accounts required. Prefer patchCompanyAccountingSettingsSchema. */
export const updateCompanyAccountingSettingsSchema = z.object({
  defaultCashAccountId: z.string().uuid(),
  defaultBankAccountId: z.string().uuid(),
});

export const patchCompanyAccountingSettingsSchema = z
  .object({
    defaultCashAccountId: z.string().uuid().optional(),
    defaultBankAccountId: z.string().uuid().optional(),
    periodLockedThrough: z.union([z.string().length(10), z.null()]).optional(),
    journalApprovalThreshold: z.union([z.string().regex(/^\d+(\.\d+)?$/), z.null()]).optional(),
  })
  .refine(
    (d) => {
      const c = d.defaultCashAccountId !== undefined;
      const b = d.defaultBankAccountId !== undefined;
      return c === b;
    },
    { message: 'Provide both default cash and bank account IDs, or neither.' }
  );
