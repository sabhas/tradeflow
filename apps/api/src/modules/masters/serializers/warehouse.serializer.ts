import { Warehouse } from '@tradeflow/db';

export function serializeWarehouse(w: Warehouse) {
  return {
    id: w.id,
    name: w.name,
    code: w.code,
    isDefault: w.isDefault,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}
