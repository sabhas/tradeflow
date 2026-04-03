import { z } from 'zod';
import { customerTypeSchema } from './masters';

const looseBool = z.preprocess((v) => {
  if (v === undefined || v === null) return undefined;
  if (v === true || v === false) return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === '') return undefined;
    if (s === 'true' || s === 'yes' || s === '1' || s === 'y') return true;
    if (s === 'false' || s === 'no' || s === '0' || s === 'n') return false;
  }
  return v;
}, z.boolean().optional());

const looseDecimal = z.preprocess((v) => {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string' && v.trim() === '') return undefined;
  return v;
}, z.union([z.number(), z.string()]).transform((v) => String(v).trim()));

/** One row after header mapping (string-ish cells). */
export const productImportRowSchema = z.object({
  supplier: z.string().min(1),
  category: z.string().min(1),
  sku: z.string().min(1),
  name: z.string().min(1),
  unit: z.string().min(1),
  barcode: z.string().optional().nullable(),
  costPrice: looseDecimal.optional(),
  sellingPrice: looseDecimal.optional(),
  batchTracked: looseBool,
  expiryTracked: looseBool,
});

export const customerImportRowSchema = z.object({
  name: z.string().min(1),
  type: customerTypeSchema,
  contactPhone: z.string().optional().nullable(),
  contactEmail: z.string().optional().nullable(),
  contactAddress: z.string().optional().nullable(),
  creditLimit: looseDecimal.optional(),
  paymentTerms: z.string().optional().nullable(),
  taxProfile: z.string().optional().nullable(),
});

export const openingInventoryRowSchema = z.object({
  warehouseCode: z.string().min(1),
  movementDate: z.string().min(1),
  productSku: z.string().min(1),
  quantity: looseDecimal,
  unitCost: looseDecimal.optional().nullable(),
});

const ledgerAmount = z.preprocess(
  (v) => (v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? '0' : v),
  z.union([z.number(), z.string()]).transform((x) => String(x).trim())
);

export const openingJournalRowSchema = z.object({
  entryDate: z.string().min(1),
  reference: z.string().optional().nullable(),
  accountCode: z.string().min(1),
  debit: ledgerAmount,
  credit: ledgerAmount,
});

export type ProductImportRow = z.infer<typeof productImportRowSchema>;
export type CustomerImportRow = z.infer<typeof customerImportRowSchema>;
export type OpeningInventoryRow = z.infer<typeof openingInventoryRowSchema>;
export type OpeningJournalRow = z.infer<typeof openingJournalRowSchema>;
