import { z } from 'zod';
import { documentLineInputSchema } from './sales';
import { optionalDateOnlyQuery, optionalUuidQuery, paginationQuerySchema } from './queryCommon';

const optionalUuid = z.union([z.string().uuid(), z.null()]).optional();

export const listPurchaseOrdersQuerySchema = paginationQuerySchema.extend({
  supplierId: optionalUuidQuery,
  status: z.enum(['draft', 'sent', 'partial', 'received', 'closed', 'void']).optional(),
});

export const listGrnsQuerySchema = paginationQuerySchema.extend({
  supplierId: optionalUuidQuery,
  status: z.enum(['draft', 'posted', 'void']).optional(),
  invoiceSettlement: z.enum(['awaiting_invoice', 'invoice_draft', 'invoice_posted']).optional(),
});

export const listSupplierInvoicesQuerySchema = paginationQuerySchema.extend({
  supplierId: optionalUuidQuery,
  status: z.enum(['draft', 'posted', 'void']).optional(),
});

export const listOpenSupplierInvoicesQuerySchema = z.object({
  supplierId: z.string().uuid(),
  paymentDate: optionalDateOnlyQuery,
  paymentMethod: z.string().min(1).optional(),
});

export const listSupplierPaymentsQuerySchema = paginationQuerySchema.extend({
  supplierId: optionalUuidQuery,
});

export const listPurchaseReturnsQuerySchema = paginationQuerySchema.extend({
  supplierId: optionalUuidQuery,
  status: z.enum(['draft', 'posted', 'void']).optional(),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  orderDate: z.string(),
  expectedDate: z.union([z.string(), z.null()]).optional(),
  warehouseId: z.string().uuid(),
  notes: z.string().optional().nullable(),
  discountAmount: z
    .union([z.number(), z.string()])
    .transform((v) => String(v))
    .optional(),
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
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().finite().positive(),
        bonusQuantity: z
          .union([z.number(), z.string()])
          .transform((v) => String(v))
          .optional(),
        unitPrice: z
          .union([z.number(), z.string()])
          .transform((v) => String(v))
          .optional(),
        tradePrice: z
          .union([z.number(), z.string()])
          .transform((v) => String(v))
          .optional(),
        retailPrice: z
          .union([z.number(), z.string()])
          .transform((v) => String(v))
          .optional(),
        purchaseOrderLineId: optionalUuid,
        batchCode: z.string().max(128).optional().nullable(),
        expiryDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .nullable(),
      })
    )
    .min(1),
});

export const updateGrnSchema = createGrnSchema.partial().extend({
  lines: createGrnSchema.shape.lines.optional(),
});

export const createSupplierInvoiceSchema = z.object({
  supplierId: z.string().uuid(),
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string(),
  dueDate: z.union([z.string(), z.null()]).optional(),
  purchaseOrderId: optionalUuid,
  grnId: z.string().uuid(),
  notes: z.string().optional().nullable(),
  discountAmount: z
    .union([z.number(), z.string()])
    .transform((v) => String(v))
    .optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().finite().positive(),
        unitPrice: z.union([z.number(), z.string()]).transform((v) => String(v)),
        bonusQuantity: z
          .union([z.number(), z.string()])
          .transform((v) => String(v))
          .optional(),
        discountAmount: z
          .union([z.number(), z.string()])
          .transform((v) => String(v))
          .optional(),
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
  useDebitAmount: z
    .union([z.number(), z.string()])
    .transform((v) => String(v))
    .optional(),
  paymentMethod: z.string().min(1),
  reference: z.string().optional().nullable(),
  allocations: z
    .array(
      z.object({
        supplierInvoiceId: z.string().uuid(),
        amount: z.union([z.number(), z.string()]).transform((v) => String(v)),
      })
    )
    .min(1),
});

export const createPurchaseReturnSchema = z.object({
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  returnDate: z.string(),
  grnId: optionalUuid,
  notes: z.string().optional().nullable(),
  discountAmount: z
    .union([z.number(), z.string()])
    .transform((v) => String(v))
    .optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().finite().positive(),
        unitPrice: z.union([z.number(), z.string()]).transform((v) => String(v)),
        discountAmount: z
          .union([z.number(), z.string()])
          .transform((v) => String(v))
          .optional(),
        taxProfileId: optionalUuid,
        grnLineId: optionalUuid,
      })
    )
    .min(1),
});

export const updatePurchaseReturnSchema = createPurchaseReturnSchema.partial().extend({
  lines: createPurchaseReturnSchema.shape.lines.optional(),
});
