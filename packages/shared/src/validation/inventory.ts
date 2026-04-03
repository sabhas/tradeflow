import { z } from 'zod';

const decimal = z.union([z.number(), z.string()]).transform((v) => String(v));

export const inventoryRefTypeSchema = z.enum([
  'opening_balance',
  'purchase',
  'sale',
  'adjustment',
  'transfer_in',
  'transfer_out',
]);

const openingLineSchema = z
  .object({
    productId: z.string().uuid(),
    quantity: decimal,
    unitCost: decimal.optional().nullable(),
    batchCode: z.string().max(128).optional().nullable(),
    expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  })
  .refine((l) => parseFloat(l.quantity) > 0, { message: 'Opening quantity must be positive' });

export const postOpeningBalanceSchema = z.object({
  warehouseId: z.string().uuid(),
  movementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z.array(openingLineSchema).min(1),
});

const adjustmentLineSchema = z
  .object({
    productId: z.string().uuid(),
    quantityDelta: decimal,
  })
  .refine((l) => parseFloat(l.quantityDelta) !== 0, { message: 'Adjustment delta must be non-zero' });

export const postStockAdjustmentSchema = z.object({
  warehouseId: z.string().uuid(),
  reason: z.string().min(1),
  movementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
  branchId: optionalUuid,
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: decimal,
      })
    )
    .min(1),
});
