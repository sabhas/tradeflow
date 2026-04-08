import type { Request } from 'express';
import type { z } from 'zod';
import { IsNull } from 'typeorm';
import { createPriceLevelSchema, updatePriceLevelSchema } from '@tradeflow/shared';
import { PriceLevel } from '@tradeflow/db';
import { created, ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

type CreatePriceLevelInput = z.infer<typeof createPriceLevelSchema>;
type UpdatePriceLevelInput = z.infer<typeof updatePriceLevelSchema>;

function serialize(p: PriceLevel) {
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export async function listPriceLevels(req: Request): Promise<ControllerResult> {
  const rows = await PriceLevel.find({
    order: { name: 'ASC' },
  });
  return ok({ data: rows.map(serialize) });
}

export async function createPriceLevel(req: Request, body: CreatePriceLevelInput): Promise<ControllerResult> {
  const repo = PriceLevel.getRepository();
  const row = repo.create({
    name: body.name,
  });
  await repo.save(row);
  return created({ data: serialize(row) });
}

export async function updatePriceLevel(req: Request, body: UpdatePriceLevelInput): Promise<ControllerResult> {
  const repo = PriceLevel.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (body.name !== undefined) row.name = body.name;
    await repo.save(row);
  return ok({ data: serialize(row) });
}

export async function getPriceLevelSnapshotForAudit(id: string) {
  const p = await PriceLevel.findOne({ where: { id } });
  return p ? serialize(p) : undefined;
}
