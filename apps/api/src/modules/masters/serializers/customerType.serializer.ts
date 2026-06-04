import { CustomerType } from '@tradeflow/db';

export function serializeCustomerType(row: CustomerType) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
