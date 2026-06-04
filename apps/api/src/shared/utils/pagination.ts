import { Request } from 'express';

type PaginationQuery = { limit?: number; offset?: number };

export function getPaginationFromQuery(query: PaginationQuery): { limit: number; offset: number } {
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;
  return { limit, offset };
}

export function getPagination(req: Request): { limit: number; offset: number } {
  const q = (req.validatedQuery ?? req.query) as PaginationQuery;
  const limitRaw = Number(q.limit);
  const offsetRaw = Number(q.offset);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  return { limit, offset };
}
