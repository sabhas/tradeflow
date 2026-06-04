import { TaxProfile } from '@tradeflow/db';

export function serializeTaxProfile(t: TaxProfile) {
  return {
    id: t.id,
    name: t.name,
    rate: t.rate,
    isInclusive: t.isInclusive,
    region: t.region,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}
