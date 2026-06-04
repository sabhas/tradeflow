import { Salesperson } from '@tradeflow/db';

export function serializeSalesperson(s: Salesperson) {
  return {
    id: s.id,
    name: s.name,
    code: s.code,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
