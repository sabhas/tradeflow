import { Account } from '@tradeflow/db';
import { nullable } from '../../../shared/utils/serializeHelpers';

export function serializeAccount(a: Account) {
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    parentId: nullable(a.parentId),
    isSystem: a.isSystem,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}
