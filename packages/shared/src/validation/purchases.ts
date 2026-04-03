import { z } from 'zod';
import { documentLineInputSchema } from './sales';

const optionalUuid = z.union([z.string().uuid(), z.null()]).optional();

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  orderDate: z.string(),
  expectedDate: z.union([z.string(), z.null()]).optional(),
  warehouseId: z.string().uuid(),
  notes: z.string().optional().nullable(),
  branchId: optionalUuid,
  discountAmount: z.union([z.number(), z.string()]).transform((v) => String(v)).optional(),
  lines: z.array(documentLineInputSchema).min(1),
});

export const updatePurchaseOrderSchema = createPurchaseOrderSchema.partial().extend({
  lines: z.array(documentLineInputSchema).optional(),
});

export const createGrnSchema = z.object({
  purchaseOrderId: optionalUuid,
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  grnDate: z.string(),
  branchId: optionalUuid,
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.union([z.number(), z.string()]).transform((v) => String(v)),
        unitPrice: z.union([z.number(), z.string()]).transform((v) => String(v)).optional(),
        purchaseOrderLineId: optionalUuid,
        batchCode: z.string().max(128).optional().nullable(),
        expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      })
    )
    .min(1),
});

export const createSupplierInvoiceSchema = z.object({
  supplierId: z.string().uuid(),
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string(),
  dueDate: z.union([z.string(), z.null()]).optional(),
  purchaseOrderId: optionalUuid,
  grnId: optionalUuid,
  notes: z.string().optional().nullable(),
  branchId: optionalUuid,
  discountAmount: z.union([z.number(), z.string()]).transform((v) => String(v)).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.union([z.number(), z.string()]).transform((v) => String(v)),
        unitPrice: z.union([z.number(), z.string()]).transform((v) => String(v)),
        discountAmount: z.union([z.number(), z.string()]).transform((v) => String(v)).optional(),
        taxProfileId: optionalUuid,
        grnLineId: optionalUuid,
      })
    )
    .min(1),
});

export const updateSupplierInvoiceSchema = createSupplierInvoiceSchema.partial().extend({
  lines: createSupplierInvoiceSchema.shape.lines.optional(),
});

export const createSupplierPaymentSchema = z.object({
  supplierId: z.string().uuid(),
  paymentDate: z.string(),
  amount: z.union([z.number(), z.string()]).transform((v) => String(v)),
  paymentMethod: z.string().min(1),
  reference: z.string().optional().nullable(),
  branchId: optionalUuid,
  allocations: z
    .array(
      z.object({
        supplierInvoiceId: z.string().uuid(),
        amount: z.union([z.number(), z.string()]).transform((v) => String(v)),
      })
    )
    .min(1),
});
