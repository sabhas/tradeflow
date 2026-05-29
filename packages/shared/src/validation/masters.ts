import { z } from 'zod';

const optionalUuid = z.union([z.string().uuid(), z.null()]).optional();
const decimal = z.union([z.number(), z.string()]).transform((v) => String(v));

export const customerTypeSchema = z.string().trim().min(1).max(128);

export const salesTaxStatusSchema = z.enum(['unregistered', 'registered', 'exempt']);

const optionalDateOnly = z.preprocess((v) => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  return v;
}, z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional());

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
});

export const updateProductCategorySchema = createProductCategorySchema.partial();

export const createUnitSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
});

export const updateUnitSchema = createUnitSchema.partial();

export const createPriceLevelSchema = z.object({
  name: z.string().min(1),
});

export const updatePriceLevelSchema = createPriceLevelSchema.partial();

const productPriceRowSchema = z.object({
  priceLevelId: z.string().uuid(),
  price: decimal,
});

export const costingMethodSchema = z.enum(['fifo', 'lifo']).nullable().optional();

const optionalProductStr = (max: number) =>
  z.preprocess((v) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (typeof v === 'string') {
      const t = v.trim();
      return t === '' ? null : t;
    }
    return v;
  }, z.union([z.string().max(max), z.null()]).optional());

export const createProductSchema = z.object({
  supplierId: z.string().uuid(),
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
  prices: z.array(productPriceRowSchema).optional(),

  manufacturerCode: optionalProductStr(64),
  shortName: optionalProductStr(256),
  genericName: optionalProductStr(512),
  packing: optionalProductStr(128),
  hsCode: optionalProductStr(32),
  retailPrice: decimal.optional(),
  purchaseDiscountPct: decimal.optional().nullable(),
  salesDiscountPct: decimal.optional().nullable(),
  purchaseSalesTaxPct: decimal.optional().nullable(),
  purchaseWithholdingTaxPct: decimal.optional().nullable(),
  purchaseFurtherTaxPct: decimal.optional().nullable(),
  salesSalesTaxPct: decimal.optional().nullable(),
  salesWithholdingTaxPct: decimal.optional().nullable(),
  salesFurtherTaxPct: decimal.optional().nullable(),
  saleType: optionalProductStr(64),
  saleRatePct: decimal.optional().nullable(),
  sroSchedule: optionalProductStr(128),
  sroItemSerial: optionalProductStr(128),
  isHerbal: z.boolean().optional(),
  isNarcotic: z.boolean().optional(),
  isFridged: z.boolean().optional(),
  isSurgical: z.boolean().optional(),
  staxBeforeDiscount: z.boolean().optional(),
  staxOnRetail: z.boolean().optional(),
  staxOnBonusSale: z.boolean().optional(),
  staxOnBonusPurchase: z.boolean().optional(),
  tradePriceAllBatches: z.boolean().optional(),
  autoPriceFromRetail: z.boolean().optional(),
  printNetPriceOnInvoice: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const replaceProductPricesSchema = z.object({
  prices: z.array(productPriceRowSchema),
});

export const createCustomerSchema = z.object({
  name: z.string().min(1),
  longName: z.string().max(500).optional().nullable(),
  type: customerTypeSchema,
  address: z.string().trim().min(1).max(2000),
  townId: z.string().uuid(),
  areaId: z.string().uuid(),
  telephone: z.string().max(64).optional().nullable(),
  mobile: z.string().max(64).optional().nullable(),
  contactPerson: z.string().max(256).optional().nullable(),
  ntn: z.string().max(32).optional().nullable(),
  stn: z.string().max(32).optional().nullable(),
  salesTaxStatus: salesTaxStatusSchema,
  isFiler: z.boolean(),
  licenseNo: z.string().max(128).optional().nullable(),
  licenseExpiryDate: optionalDateOnly,
  contact: contactSchema,
  creditLimit: decimal.optional(),
  paymentTermsId: optionalUuid,
  taxProfileId: optionalUuid,
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const createCustomerTypeSchema = z.object({
  name: z.string().trim().min(1).max(128),
});

export const updateCustomerTypeSchema = createCustomerTypeSchema.partial();

export const createTownSchema = z.object({
  areaId: z.string().uuid(),
  name: z.string().min(1),
});

export const updateTownSchema = createTownSchema.partial();

export const createAreaSchema = z.object({
  name: z.string().min(1),
});

export const updateAreaSchema = createAreaSchema.partial();

export const createSupplierSchema = z.object({
  name: z.string().min(1),
  address: z.string().max(2000).optional().nullable(),
  city: z.string().max(256).optional().nullable(),
  telephone: z.string().max(64).optional().nullable(),
  mobileNo: z.string().max(64).optional().nullable(),
  email: z.string().max(320).optional().nullable(),
  website: z.string().max(256).optional().nullable(),
  contact: z.string().max(256).optional().nullable(),
  ntn: z.string().max(32).optional().nullable(),
  stn: z.string().max(32).optional().nullable(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export const createWarehouseSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  isDefault: z.boolean().optional(),
});

export const updateWarehouseSchema = createWarehouseSchema.partial();

export const createSalespersonSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
});

export const updateSalespersonSchema = createSalespersonSchema.partial();

export const createTaxProfileSchema = z.object({
  name: z.string().min(1),
  rate: decimal,
  isInclusive: z.boolean().optional(),
  region: z.string().optional().nullable(),
});

export const updateTaxProfileSchema = createTaxProfileSchema.partial();

export const createPaymentTermsSchema = z.object({
  name: z.string().min(1),
  netDays: z.number().int().min(0).optional(),
});

export const updatePaymentTermsSchema = createPaymentTermsSchema.partial();

export const createBonusRuleSchema = z.object({
  productId: z.string().uuid(),
  minQuantity: decimal,
  bonusQuantity: decimal,
  isActive: z.boolean().optional(),
});

export const updateBonusRuleSchema = createBonusRuleSchema.partial().extend({
  productId: z.string().uuid().optional(),
});

export const calculateBonusSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().finite().positive(),
});

export type CreateProductCategoryInput = z.infer<typeof createProductCategorySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
