import { z } from 'zod';
import {
  booleanStringQuery,
  dateRangeQuerySchema,
  optionalDateOnlyQuery,
  optionalUuidQuery,
  paginationQuerySchema,
} from './queryCommon';

const decimal = z.union([z.number(), z.string()]).transform((v) => String(v));
const optionalUuid = z.union([z.string().uuid(), z.null()]).optional();

/** Line quantity from API / clients (positive finite number). */
export const lineQuantitySchema = z.number().finite().positive();

export const documentLineInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: lineQuantitySchema,
  unitPrice: decimal,
  discountAmount: decimal.optional(),
  taxProfileId: optionalUuid,
});

export const createQuotationSchema = z.object({
  customerId: z.string().uuid(),
  quotationDate: z.string(),
  validUntil: z.union([z.string(), z.null()]).optional(),
  notes: z.string().optional().nullable(),
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
  salespersonId: optionalUuid,
  notes: z.string().optional().nullable(),
  discountAmount: decimal.optional(),
  lines: z.array(documentLineInputSchema).min(1),
});

export const updateSalesOrderSchema = createSalesOrderSchema.partial().extend({
  lines: z.array(documentLineInputSchema).optional(),
});

/** Bulk confirm (draft→confirmed) or bulk delete (draft only). */
export const bulkSalesOrdersSchema = z.object({
  action: z.enum(['confirm', 'delete']),
  ids: z.array(z.string().uuid()).min(1).max(100),
});

export const paymentTypeSchema = z.enum(['cash', 'credit']);

const invoiceLineInputSchema = documentLineInputSchema.extend({
  unitPrice: decimal.optional(),
  bonusQuantity: decimal.optional(),
  originalInvoiceLineId: z.union([z.string().uuid(), z.null()]).optional(),
  batchCode: z.string().max(128).optional().nullable(),
  expiryDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
});

const invoiceFormFieldsSchema = z.object({
  customerId: z.string().uuid(),
  invoiceDate: z.string(),
  dueDate: z.union([z.string(), z.null()]).optional(),
  paymentType: paymentTypeSchema.optional(),
  warehouseId: z.string().uuid(),
  salesOrderId: optionalUuid,
  salespersonId: optionalUuid,
  invoiceTemplateId: optionalUuid,
  notes: z.string().optional().nullable(),
  discountAmount: decimal.optional(),
  documentKind: z.enum(['invoice', 'credit_note']).optional(),
  originalInvoiceId: z.union([z.string().uuid(), z.null()]).optional(),
  lines: z.array(invoiceLineInputSchema).min(1),
});

export const createInvoiceSchema = invoiceFormFieldsSchema.superRefine((data, ctx) => {
  const dk = data.documentKind ?? 'invoice';
  if (dk === 'credit_note') {
    if (!data.originalInvoiceId) {
      ctx.addIssue({
        code: 'custom',
        message: 'originalInvoiceId is required for credit notes',
        path: ['originalInvoiceId'],
      });
    }
    if (data.salesOrderId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Credit notes cannot reference a sales order',
        path: ['salesOrderId'],
      });
    }
    data.lines.forEach((line, i) => {
      if (!line.originalInvoiceLineId) {
        ctx.addIssue({
          code: 'custom',
          message: 'originalInvoiceLineId is required for each credit note line',
          path: ['lines', i, 'originalInvoiceLineId'],
        });
      }
    });
  }
});

export const updateInvoiceSchema = invoiceFormFieldsSchema.partial().extend({
  lines: z.array(invoiceLineInputSchema).optional(),
});

export const convertToOrderSchema = z.object({}).strict();

export const partialInvoiceFromOrderSchema = z.object({
  lines: z
    .array(
      z.object({
        salesOrderLineId: z.string().uuid(),
        quantity: lineQuantitySchema,
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

export const printInvoicesBatchSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('ids'),
    ids: z.array(z.string().uuid()).min(1).max(50),
  }),
  z.object({
    mode: z.literal('filter'),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    customerId: z.string().uuid().optional(),
    status: z.string().optional(),
    limit: z.number().int().positive().max(100).optional(),
  }),
]);

export const listSalesOrdersQuerySchema = paginationQuerySchema.extend({
  customerId: optionalUuidQuery,
  status: z.enum(['draft', 'confirmed', 'void']).optional(),
  dateFrom: optionalDateOnlyQuery,
  dateTo: optionalDateOnlyQuery,
  warehouseId: optionalUuidQuery,
  q: z.string().optional(),
  hasInvoice: booleanStringQuery.optional(),
});

export const listInvoicesQuerySchema = paginationQuerySchema.extend({
  customerId: optionalUuidQuery,
  status: z.enum(['draft', 'posted', 'void']).optional(),
  documentKind: z.enum(['invoice', 'credit_note']).optional(),
  dateFrom: optionalDateOnlyQuery,
  dateTo: optionalDateOnlyQuery,
});

export const listQuotationsQuerySchema = paginationQuerySchema.extend({
  customerId: optionalUuidQuery,
});

export const listReceiptsQuerySchema = paginationQuerySchema.extend({
  customerId: optionalUuidQuery,
  dateFrom: optionalDateOnlyQuery,
  dateTo: optionalDateOnlyQuery,
});

export const customerStatementQuerySchema = dateRangeQuerySchema;

export const createReceiptSchema = z.object({
  customerId: z.string().uuid(),
  receiptDate: z.string(),
  amount: decimal,
  paymentMethod: z.string().min(1),
  reference: z.string().optional().nullable(),
  allocations: z
    .array(
      z.object({
        invoiceId: z.string().uuid(),
        amount: decimal,
      })
    )
    .min(1),
});
