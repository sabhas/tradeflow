import { StockTransfer, StockTransferLine } from '@tradeflow/db';
import { nullable } from '../../../shared/utils/serializeHelpers';

export function serializeStockTransfer(t: StockTransfer, lines?: StockTransferLine[]) {
  return {
    id: t.id,
    fromWarehouseId: t.fromWarehouseId,
    toWarehouseId: t.toWarehouseId,
    transferDate: t.transferDate,
    status: t.status,
    notes: nullable(t.notes),
    createdBy: nullable(t.createdBy),
    createdAt: t.createdAt,
    fromWarehouse: t.fromWarehouse
      ? { id: t.fromWarehouse.id, name: t.fromWarehouse.name, code: t.fromWarehouse.code }
      : undefined,
    toWarehouse: t.toWarehouse
      ? { id: t.toWarehouse.id, name: t.toWarehouse.name, code: t.toWarehouse.code }
      : undefined,
    lines:
      lines?.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        product: l.product ? { id: l.product.id, sku: l.product.sku, name: l.product.name } : undefined,
      })) ?? undefined,
  };
}
