import { UnitOfMeasure } from '@tradeflow/db';

export function serializeUnit(u: UnitOfMeasure) {
  return {
    id: u.id,
    code: u.code,
    name: u.name,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}
