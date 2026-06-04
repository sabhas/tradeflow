import { PriceLevel } from '@tradeflow/db';

export function serializePriceLevel(p: PriceLevel) {
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
