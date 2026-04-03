import { z } from 'zod';

const optionalUuid = z.union([z.string().uuid(), z.null()]).optional();
const decimal = z.union([z.number(), z.string()]).transform((v) => String(v));

export const customerTypeSchema = z.enum(['retailer', 'wholesaler', 'walk_in']);

export const contactSchema = z
  .object({
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
  })
  .optional()
  .nullable();

export const createProductCategorySchema = z.object({
  parentId: optionalUuid,
  name: z.string().min(1),
  code: z.string().min(1),
  branchId: optionalUuid,
});

export const updateProductCategorySchema = createProductCategorySchema.partial();

export const createUnitSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  branchId: optionalUuid,
});

export const updateUnitSchema = createUnitSchema.partial();

export const createPriceLevelSchema = z.object({
  name: z.string().min(1),
  branchId: optionalUuid,
});

export const updatePriceLevelSchema = createPriceLevelSchema.partial();

const productPriceRowSchema = z.object({
  priceLevelId: z.string().uuid(),
  price: decimal,
});

export const costingMethodSchema = z.enum(['fifo', 'lifo']).nullable().optional();

export const createProductSchema = z.object({
  categoryId: z.string().uuid(),
  sku: z.string().min(1),
  barcode: z.string().optional().nullable(),
  name: z.string().min(1),
  unitId: z.string().uuid(),
  costPrice: decimal.optional(),
  sellingPrice: decimal.optional(),
  batchTracked: z.boolean().optional(),
  expiryTracked: z.boolean().optional(),
  costingMethod: costingMethodSchema,
  minStock: decimal.optional().nullable(),
  reorderLevel: decimal.optional().nullable(),
  branchId: optionalUuid,
  prices: z.array(productPriceRowSchema).optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const replaceProductPricesSchema = z.object({
  prices: z.array(productPriceRowSchema),
});

export const createCustomerSchema = z.object({
  name: z.string().min(1),
  type: customerTypeSchema,
  contact: contactSchema,
  creditLimit: decimal.optional(),
  paymentTermsId: optionalUuid,
  taxProfileId: optionalUuid,
  branchId: optionalUuid,
  defaultRouteId: optionalUuid,
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const createSupplierSchema = z.object({
  name: z.string().min(1),
  contact: contactSchema,
  paymentTermsId: optionalUuid,
  taxProfileId: optionalUuid,
  branchId: optionalUuid,
});

export const updateSupplierSchema = createSupplierSchema.partial();

export const createWarehouseSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  branchId: optionalUuid,
  isDefault: z.boolean().optional(),
});

export const updateWarehouseSchema = createWarehouseSchema.partial();

export const createSalespersonSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  branchId: optionalUuid,
});

export const updateSalespersonSchema = createSalespersonSchema.partial();

export const createTaxProfileSchema = z.object({
  name: z.string().min(1),
  rate: decimal,
  isInclusive: z.boolean().optional(),
  region: z.string().optional().nullable(),
  branchId: optionalUuid,
});

export const updateTaxProfileSchema = createTaxProfileSchema.partial();

export const createPaymentTermsSchema = z.object({
  name: z.string().min(1),
  netDays: z.number().int().min(0).optional(),
  branchId: optionalUuid,
});

export const updatePaymentTermsSchema = createPaymentTermsSchema.partial();

export type CreateProductCategoryInput = z.infer<typeof createProductCategorySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
