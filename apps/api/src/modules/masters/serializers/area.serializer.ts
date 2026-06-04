import { Area } from '@tradeflow/db';

export function serializeArea(a: Area) {
  return {
    id: a.id,
    name: a.name,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    deletedAt: a.deletedAt,
  };
}
