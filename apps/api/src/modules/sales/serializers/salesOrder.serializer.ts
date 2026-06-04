import { Product, SalesOrder, SalesOrderLine } from '@tradeflow/db';
import { nullable } from '../../../shared/utils/serializeHelpers';

export function serializeSalesOrder(
  o: SalesOrder,
  lines?: Array<SalesOrderLine & { product?: Product }>,
  opts?: { hasInvoice?: boolean; lineCount?: number }
) {
  const lineCount = opts?.lineCount !== undefined ? opts.lineCount : (lines?.length ?? 0);
  return {
    id: o.id,
    customerId: o.customerId,
    customerName: nullable(o.customer?.name),
    orderDate: o.orderDate,
    status: o.status,
    hasInvoice: opts?.hasInvoice ?? false,
    warehouseId: o.warehouseId,
    warehouseName: nullable(o.warehouse?.name),
    salespersonName: nullable(o.salesperson?.name),
    lineCount,
    subtotal: o.subtotal,
    taxAmount: o.taxAmount,
    discountAmount: o.discountAmount,
    total: o.total,
    notes: o.notes,
    salespersonId: o.salespersonId,
    createdBy: o.createdBy,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    lines:
      lines?.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        bonusQuantity: l.bonusQuantity ?? '0',
        unitPrice: l.unitPrice,
        taxAmount: l.taxAmount,
        discountAmount: l.discountAmount,
        deliveredQuantity: l.deliveredQuantity,
        taxProfileId: l.taxProfileId,
        product: l.product ? { sku: l.product.sku, name: l.product.name } : undefined,
      })) ?? undefined,
  };
}
