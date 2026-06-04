import { ProductCategory } from '@tradeflow/db';

export function serializeCategory(c: ProductCategory) {
  return {
    id: c.id,
    parentId: c.parentId,
    name: c.name,
    code: c.code,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    deletedAt: c.deletedAt,
  };
}
