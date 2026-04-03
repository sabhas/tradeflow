import { Request } from 'express';
import { User } from '@tradeflow/db';

export function resolveBranchId(req: Request & { user?: User }): string | undefined {
  const header = req.get('x-branch-id')?.trim();
  if (header === 'all' || header === '') return undefined;
  if (header) return header;

  const raw = req.query.branchId;
  if (raw === 'all' || raw === '') return undefined;
  if (typeof raw === 'string' && raw) return raw;
  return req.user?.branchId ?? undefined;
}
