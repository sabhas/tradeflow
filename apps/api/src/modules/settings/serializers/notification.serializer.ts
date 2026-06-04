import { UserNotification } from '@tradeflow/db';
import { nullable } from '../../../shared/utils/serializeHelpers';

export function serializeNotification(n: UserNotification) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: nullable(n.body),
    readAt: nullable(n.readAt),
    createdAt: n.createdAt,
  };
}
