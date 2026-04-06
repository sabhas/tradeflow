import type { Request } from 'express';
import type { z } from 'zod';
import { IsNull } from 'typeorm';
import { createSalespersonSchema, updateSalespersonSchema } from '@tradeflow/shared';
import { dataSource, Salesperson } from '@tradeflow/db';
import { resolveBranchId } from '../utils/branchScope';
import { created, ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

type CreateSalespersonInput = z.infer<typeof createSalespersonSchema>;
type UpdateSalespersonInput = z.infer<typeof updateSalespersonSchema>;

function serialize(s: Salesperson) {
  return {
    id: s.id,
    name: s.name,
    code: s.code,
    branchId: s.branchId,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export async function listSalespersons(req: Request): Promise<ControllerResult> {
  const branchId = resolveBranchId(req);
  const rows = await dataSource.getRepository(Salesperson).find({
    where: branchId ? [{ branchId: IsNull() }, { branchId }] : {},
    order: { name: 'ASC' },
  });
  return ok({ data: rows.map(serialize) });
}

export async function createSalesperson(req: Request, body: CreateSalespersonInput): Promise<ControllerResult> {
  const repo = dataSource.getRepository(Salesperson);
  const row = repo.create({
    name: body.name,
    code: body.code,
    branchId: body.branchId ?? req.user?.branchId ?? undefined,
  });
  await repo.save(row);
  return created({ data: serialize(row) });
}

export async function updateSalesperson(req: Request, body: UpdateSalespersonInput): Promise<ControllerResult> {
  const repo = dataSource.getRepository(Salesperson);
  const row = await repo.findOne({ where: { id: req.params.id } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (body.name !== undefined) row.name = body.name;
  if (body.code !== undefined) row.code = body.code;
  if (body.branchId !== undefined) row.branchId = body.branchId ?? undefined;
  await repo.save(row);
  return ok({ data: serialize(row) });
}

export async function deleteSalesperson(req: Request): Promise<ControllerResult> {
  const repo = dataSource.getRepository(Salesperson);
  const row = await repo.findOne({ where: { id: req.params.id } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  await repo.remove(row);
  return ok({ data: { id: row.id, deleted: true } });
}

export async function getSalespersonSnapshotForAudit(id: string) {
  const s = await dataSource.getRepository(Salesperson).findOne({ where: { id } });
  return s ? serialize(s) : undefined;
}
