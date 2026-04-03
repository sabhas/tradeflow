import { z } from 'zod';

const optionalUuid = z.union([z.string().uuid(), z.null()]).optional();
const decimal = z.union([z.number(), z.string()]).transform((v) => String(v));

export const createDeliveryRouteSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string().optional().nullable(),
  branchId: optionalUuid,
});

export const updateDeliveryRouteSchema = createDeliveryRouteSchema.partial().extend({
  stops: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        sequenceOrder: z.number().int().min(0),
        customerId: optionalUuid,
        addressLine: z.string().optional().nullable(),
      })
    )
    .optional(),
});

export const routeStopInputSchema = z.object({
  sequenceOrder: z.number().int().min(0),
  customerId: optionalUuid,
  addressLine: z.string().optional().nullable(),
});

export const createDeliveryRunSchema = z.object({
  runDate: z.string(),
  routeId: z.string().uuid(),
  vehicleInfo: z.string().optional().nullable(),
  driverSalespersonId: optionalUuid,
  status: z.enum(['draft', 'dispatched', 'completed', 'cancelled']).optional(),
  branchId: optionalUuid,
  coldChainRequired: z.boolean().optional(),
  controlledDeliveryRequired: z.boolean().optional(),
  dispatchComplianceNote: z.string().optional().nullable(),
  deliveryComplianceNote: z.string().optional().nullable(),
  deliveryNoteIds: z.array(z.string().uuid()).optional(),
});

export const updateDeliveryRunSchema = z.object({
  runDate: z.string().optional(),
  routeId: z.string().uuid().optional(),
  vehicleInfo: z.string().optional().nullable(),
  driverSalespersonId: optionalUuid,
  status: z.enum(['draft', 'dispatched', 'completed', 'cancelled']).optional(),
  branchId: optionalUuid,
  coldChainRequired: z.boolean().optional(),
  controlledDeliveryRequired: z.boolean().optional(),
  dispatchComplianceNote: z.string().optional().nullable(),
  deliveryComplianceNote: z.string().optional().nullable(),
  deliveryNoteIds: z.array(z.string().uuid()).optional(),
});

export const createDeliveryNoteSchema = z
  .object({
    invoiceId: z.string().uuid().optional(),
    salesOrderId: z.string().uuid().optional(),
    deliveryDate: z.union([z.string(), z.null()]).optional(),
    warehouseId: optionalUuid,
    branchId: optionalUuid,
    coldChainRequired: z.boolean().optional(),
    controlledDeliveryRequired: z.boolean().optional(),
    lines: z
      .array(
        z.object({
          invoiceLineId: z.string().uuid().optional(),
          salesOrderLineId: z.string().uuid().optional(),
          quantity: decimal,
        })
      )
      .optional(),
  })
  .refine((b) => !!(b.invoiceId || b.salesOrderId), {
    message: 'invoiceId or salesOrderId is required',
  });

export const updateDeliveryNoteSchema = z.object({
  deliveryDate: z.union([z.string(), z.null()]).optional(),
  status: z.enum(['pending', 'dispatched', 'delivered']).optional(),
  warehouseId: optionalUuid,
  branchId: optionalUuid,
  coldChainRequired: z.boolean().optional(),
  controlledDeliveryRequired: z.boolean().optional(),
  dispatchComplianceNote: z.string().optional().nullable(),
  deliveryComplianceNote: z.string().optional().nullable(),
});

export const proofOfDeliverySchema = z.object({
  type: z.enum(['signature', 'photo']),
  reference: z.string().min(1),
  notes: z.string().optional().nullable(),
});
