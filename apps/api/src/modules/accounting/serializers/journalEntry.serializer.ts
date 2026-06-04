import { Account, JournalEntry, JournalLine } from '@tradeflow/db';
import { nullable } from '../../../shared/utils/serializeHelpers';

export function serializeJournalEntry(e: JournalEntry, lines?: JournalLine[]) {
  return {
    id: e.id,
    entryDate: e.entryDate,
    reference: nullable(e.reference),
    description: nullable(e.description),
    status: e.status,
    sourceType: nullable(e.sourceType),
    sourceId: nullable(e.sourceId),
    createdBy: nullable(e.createdBy),
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    deletedAt: nullable(e.deletedAt),
    lines:
      lines?.map((l) => {
        const acc = (l as JournalLine & { account?: Account }).account;
        return {
          id: l.id,
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          account: acc ? { code: acc.code, name: acc.name } : undefined,
        };
      }) ?? undefined,
  };
}
