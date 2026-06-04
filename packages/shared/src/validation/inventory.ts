import { z } from 'zod';
import {
  optionalBooleanStringQuery,
  optionalDateOnlyQuery,
  optionalUuidQuery,
  paginationQuerySchema,
} from './queryCommon';

const decimal = z.union([z.number(), z.string()]).transform((v) => String(v));

export const listStockSummaryQuerySchema = z.object({
  warehouseId: optionalUuidQuery,
  productId: optionalUuidQuery,
  supplierId: optionalUuidQuery,
});

export const listStockLayersQuerySchema = z.object({
  warehouseId: optionalUuidQuery,
  productId: optionalUuidQuery,
  supplierId: optionalUuidQuery,
  batch: z.string().optional(),
  expiryBefore: optionalDateOnlyQuery,
  orderBy: z.enum(['expiry']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  includeDepleted: optionalBooleanStringQuery,
});

export const listInventoryMovementsQuerySchema = paginationQuerySchema.extend({
  warehouseId: optionalUuidQuery,
  productId: optionalUuidQuery,
  refType: z
    .enum(['opening_balance', 'purchase', 'sale', 'adjustment', 'transfer_in', 'transfer_out'])
    .optional(),
  dateFrom: optionalDateOnlyQuery,
  dateTo: optionalDateOnlyQuery,
});

export const listStockTransfersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['draft', 'posted', 'void']).optional(),
});
const lineQuantityPositive = z.number().finite().positive();

export const inventoryRefTypeSchema = z.enum([
  'opening_balance',
  'purchase',
  'sale',
  'adjustment',
  'transfer_in',
  'transfer_out',
]);

const openingLineSchema = z.object({
  productId: z.string().uuid(),
  quantity: lineQuantityPositive,
  unitCost: decimal.optional().nullable(),
  batchCode: z.string().max(128).optional().nullable(),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
});

export const postOpeningBalanceSchema = z.object({
  warehouseId: z.string().uuid(),
  movementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z.array(openingLineSchema).min(1),
});

const adjustmentLineSchema = z
  .object({
    productId: z.string().uuid(),
    quantityDelta: z.number().finite(),
  })
  .refine((l) => l.quantityDelta !== 0, { message: 'Adjustment delta must be non-zero' });

export const postStockAdjustmentSchema = z.object({
  warehouseId: z.string().uuid(),
  reason: z.string().min(1),
  movementDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  lines: z.array(adjustmentLineSchema).min(1),
});

export type PostOpeningBalanceInput = z.infer<typeof postOpeningBalanceSchema>;
export type PostStockAdjustmentInput = z.infer<typeof postStockAdjustmentSchema>;

const optionalUuid = z.union([z.string().uuid(), z.null()]).optional();

export const createStockTransferSchema = z.object({
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional().nullable(),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: lineQuantityPositive,
      })
    )
    .min(1),
});
