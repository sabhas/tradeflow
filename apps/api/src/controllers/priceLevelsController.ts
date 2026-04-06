import type { Request } from 'express';
import type { z } from 'zod';
import { IsNull } from 'typeorm';
import { createPriceLevelSchema, updatePriceLevelSchema } from '@tradeflow/shared';
import { dataSource, PriceLevel } from '@tradeflow/db';
import { resolveBranchId } from '../utils/branchScope';
import { created, ok, type ControllerResult } from './controllerResult';
import { HttpError } from './httpError';

type CreatePriceLevelInput = z.infer<typeof createPriceLevelSchema>;
type UpdatePriceLevelInput = z.infer<typeof updatePriceLevelSchema>;

function serialize(p: PriceLevel) {
  return {
    id: p.id,
    name: p.name,
    branchId: p.branchId,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export async function listPriceLevels(req: Request): Promise<ControllerResult> {
  const branchId = resolveBranchId(req);
  const rows = await dataSource.getRepository(PriceLevel).find({
    where: branchId ? [{ branchId: IsNull() }, { branchId }] : {},
    order: { name: 'ASC' },
  });
  return ok({ data: rows.map(serialize) });
}

export async function createPriceLevel(req: Request, body: CreatePriceLevelInput): Promise<ControllerResult> {
  const repo = dataSource.getRepository(PriceLevel);
  const row = repo.create({
    name: body.name,
    branchId: body.branchId ?? req.user?.branchId ?? undefined,
  });
  await repo.save(row);
  return created({ data: serialize(row) });
}

export async function updatePriceLevel(req: Request, body: UpdatePriceLevelInput): Promise<ControllerResult> {
  const repo = dataSource.getRepository(PriceLevel);
  const row = await repo.findOne({ where: { id: req.params.id } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (body.name !== undefined) row.name = body.name;
  if (body.branchId !== undefined) row.branchId = body.branchId ?? undefined;
  await repo.save(row);
  return ok({ data: serialize(row) });
}

export async function getPriceLevelSnapshotForAudit(id: string) {
  const p = await dataSource.getRepository(PriceLevel).findOne({ where: { id } });
  return p ? serialize(p) : undefined;
}
