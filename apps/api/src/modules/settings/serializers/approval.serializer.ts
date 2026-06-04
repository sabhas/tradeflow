import { ApprovalRequest } from '@tradeflow/db';
import { nullable } from '../../../shared/utils/serializeHelpers';

export function serializeApprovalRequest(a: ApprovalRequest) {
  return {
    id: a.id,
    entityType: a.entityType,
    entityId: a.entityId,
    status: a.status,
    requestedBy: nullable(a.requestedBy),
    reviewedBy: nullable(a.reviewedBy),
    reviewNote: nullable(a.reviewNote),
    createdAt: a.createdAt,
    reviewedAt: nullable(a.reviewedAt),
  };
}
