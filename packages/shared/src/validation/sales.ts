import { z } from 'zod';

const decimal = z.union([z.number(), z.string()]).transform((v) => String(v));
const optionalUuid = z.union([z.string().uuid(), z.null()]).optional();

export const documentLineInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: decimal,
  unitPrice: decimal,
  discountAmount: decimal.optional(),
  taxProfileId: optionalUuid,
});

export const createQuotationSchema = z.object({
  customerId: z.string().uuid(),
  quotationDate: z.string(),
  validUntil: z.union([z.string(), z.null()]).optional(),
  notes: z.string().optional().nullable(),
  branchId: optionalUuid,
  discountAmount: decimal.optional(),
  lines: z.array(documentLineInputSchema).min(1),
});

export const updateQuotationSchema = createQuotationSchema.partial().extend({
  lines: z.array(documentLineInputSchema).optional(),
});

export const createSalesOrderSchema = z.object({
  customerId: z.string().uuid(),
  orderDate: z.string(),
  warehouseId: optionalUuid,
  notes: z.string().optional().nullable(),
  branchId: optionalUuid,
  discountAmount: decimal.optional(),
  lines: z.array(documentLineInputSchema).min(1),
});

export const updateSalesOrderSchema = createSalesOrderSchema.partial().extend({
  lines: z.array(documentLineInputSchema).optional(),
});

export const paymentTypeSchema = z.enum(['cash', 'credit']);

export const createInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  invoiceDate: z.string(),
  dueDate: z.union([z.string(), z.null()]).optional(),
  paymentType: paymentTypeSchema.optional(),
  warehouseId: z.string().uuid(),
  salesOrderId: optionalUuid,
  notes: z.string().optional().nullable(),
  branchId: optionalUuid,
  discountAmount: decimal.optional(),
  lines: z.array(documentLineInputSchema).min(1),
});

export const updateInvoiceSchema = createInvoiceSchema.partial().extend({
  lines: z.array(documentLineInputSchema).optional(),
});

export const convertToOrderSchema = z.object({}).strict();

export const partialInvoiceFromOrderSchema = z.object({
  lines: z
    .array(
      z.object({
        salesOrderLineId: z.string().uuid(),
        quantity: decimal,
      })
    )
    .min(1),
  discountAmount: decimal.optional(),
});

export const convertOrderToInvoiceSchema = partialInvoiceFromOrderSchema.extend({
  warehouseId: z.string().uuid(),
  paymentType: paymentTypeSchema.optional(),
  invoiceDate: z.string().optional(),
  dueDate: z.union([z.string(), z.null()]).optional(),
});

export const createReceiptSchema = z.object({
  customerId: z.string().uuid(),
  receiptDate: z.string(),
  amount: decimal,
  paymentMethod: z.string().min(1),
  reference: z.string().optional().nullable(),
  branchId: optionalUuid,
  allocations: z
    .array(
      z.object({
        invoiceId: z.string().uuid(),
        amount: decimal,
      })
    )
    .min(1),
});
