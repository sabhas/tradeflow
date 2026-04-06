import type { Request } from 'express';
import type { z } from 'zod';
import { IsNull } from 'typeorm';
import { createTaxProfileSchema, updateTaxProfileSchema } from '@tradeflow/shared';
import { dataSource, TaxProfile } from '@tradeflow/db';
import { resolveBranchId } from '../utils/branchScope';
import { created, ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

type CreateTaxProfileInput = z.infer<typeof createTaxProfileSchema>;
type UpdateTaxProfileInput = z.infer<typeof updateTaxProfileSchema>;

function serialize(t: TaxProfile) {
  return {
    id: t.id,
    name: t.name,
    rate: t.rate,
    isInclusive: t.isInclusive,
    region: t.region,
    branchId: t.branchId,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export async function listTaxProfiles(req: Request): Promise<ControllerResult> {
  const branchId = resolveBranchId(req);
  const rows = await dataSource.getRepository(TaxProfile).find({
    where: branchId ? [{ branchId: IsNull() }, { branchId }] : {},
    order: { name: 'ASC' },
  });
  return ok({ data: rows.map(serialize) });
}

export async function createTaxProfile(req: Request, body: CreateTaxProfileInput): Promise<ControllerResult> {
  const repo = dataSource.getRepository(TaxProfile);
  const row = repo.create({
    name: body.name,
    rate: body.rate,
    isInclusive: body.isInclusive ?? false,
    region: body.region ?? undefined,
    branchId: body.branchId ?? req.user?.branchId ?? undefined,
  });
  await repo.save(row);
  return created({ data: serialize(row) });
}

export async function updateTaxProfile(req: Request, body: UpdateTaxProfileInput): Promise<ControllerResult> {
  const repo = dataSource.getRepository(TaxProfile);
  const row = await repo.findOne({ where: { id: req.params.id } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (body.name !== undefined) row.name = body.name;
  if (body.rate !== undefined) row.rate = body.rate;
  if (body.isInclusive !== undefined) row.isInclusive = body.isInclusive;
  if (body.region !== undefined) row.region = body.region ?? undefined;
  if (body.branchId !== undefined) row.branchId = body.branchId ?? undefined;
  await repo.save(row);
  return ok({ data: serialize(row) });
}

export async function deleteTaxProfile(req: Request): Promise<ControllerResult> {
  const repo = dataSource.getRepository(TaxProfile);
  const row = await repo.findOne({ where: { id: req.params.id } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  await repo.remove(row);
  return ok({ data: { id: row.id, deleted: true } });
}

export async function getTaxProfileSnapshotForAudit(id: string) {
  const t = await dataSource.getRepository(TaxProfile).findOne({ where: { id } });
  return t ? serialize(t) : undefined;
}
