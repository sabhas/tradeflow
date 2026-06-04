import { InventoryMovement, StockBalance } from '@tradeflow/db';
import { nullable } from '../../../shared/utils/serializeHelpers';

function formatMovementDate(d: unknown): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  if (typeof d === 'string') return d.slice(0, 10);
  return String(d);
}

export function serializeMovement(m: InventoryMovement) {
  return {
    id: m.id,
    productId: m.productId,
    warehouseId: m.warehouseId,
    quantityDelta: m.quantityDelta,
    refType: m.refType,
    refId: m.refId,
    grnLineId: nullable(m.grnLineId),
    invoiceLineId: nullable(m.invoiceLineId),
    stockTransferLineId: nullable(m.stockTransferLineId),
    unitCost: m.unitCost,
    movementDate: formatMovementDate(m.movementDate),
    notes: m.notes,
    userId: m.userId,
    createdAt: m.createdAt,
    product: m.product
      ? { id: m.product.id, sku: m.product.sku, name: m.product.name, costPrice: m.product.costPrice }
      : undefined,
    warehouse: m.warehouse
      ? { id: m.warehouse.id, name: m.warehouse.name, code: m.warehouse.code }
      : undefined,
  };
}

export function serializeBalance(sb: StockBalance) {
  const cost = sb.product?.costPrice;
  const qty = sb.quantity;
  const value =
    cost !== undefined && cost !== null && sb.product
      ? (parseFloat(qty) * parseFloat(String(cost))).toFixed(4)
      : undefined;
  return {
    id: sb.id,
    productId: sb.productId,
    warehouseId: sb.warehouseId,
    quantity: sb.quantity,
    updatedAt: sb.updatedAt,
    product: sb.product
      ? {
          id: sb.product.id,
          sku: sb.product.sku,
          name: sb.product.name,
          costPrice: sb.product.costPrice,
          tradePrice: sb.product.sellingPrice,
          retailPrice: sb.product.retailPrice,
          supplier: sb.product.supplier
            ? { id: sb.product.supplier.id, name: sb.product.supplier.name }
            : undefined,
        }
      : undefined,
    warehouse: sb.warehouse
      ? { id: sb.warehouse.id, name: sb.warehouse.name, code: sb.warehouse.code }
      : undefined,
    valueAtCost: value,
  };
}
