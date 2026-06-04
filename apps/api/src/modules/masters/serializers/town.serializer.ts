import { Town } from '@tradeflow/db';
import { relationIdName } from '../../../shared/utils/serializeHelpers';

export function serializeTown(t: Town) {
  return {
    id: t.id,
    name: t.name,
    areaId: t.areaId,
    area: relationIdName(t.area),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    deletedAt: t.deletedAt,
  };
}
