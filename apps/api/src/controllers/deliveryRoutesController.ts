import type { Request } from 'express';
import type { z } from 'zod';
import {
  createDeliveryRouteSchema,
  updateDeliveryRouteSchema,
} from '@tradeflow/shared';
import { DeliveryRoute, RouteStop } from '@tradeflow/db';
import { getPagination } from '../utils/pagination';
import { created, ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

type CreateDeliveryRouteInput = z.infer<typeof createDeliveryRouteSchema>;
type UpdateDeliveryRouteInput = z.infer<typeof updateDeliveryRouteSchema>;

function serializeStop(s: RouteStop) {
  return {
    id: s.id,
    routeId: s.routeId,
    sequenceOrder: s.sequenceOrder,
    customerId: s.customerId,
    addressLine: s.addressLine,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

function serializeRoute(r: DeliveryRoute, stops?: RouteStop[]) {
  return {
    id: r.id,
    name: r.name,
    code: r.code,
    description: r.description,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    stops: stops?.map(serializeStop),
  };
}

export async function listDeliveryRoutes(req: Request): Promise<ControllerResult> {
  const { limit, offset } = getPagination(req);
  const qb = DeliveryRoute
    .createQueryBuilder('r')
    .orderBy('r.code', 'ASC')
    .take(limit)
    .skip(offset);
  const [rows, total] = await qb.getManyAndCount();
  return ok({ data: rows.map((r) => serializeRoute(r)), meta: { total, limit, offset } });
}

export async function createDeliveryRoute(
  req: Request,
  body: CreateDeliveryRouteInput
): Promise<ControllerResult> {
  const repo = DeliveryRoute.getRepository();
  const row = repo.create({
    name: body.name,
    code: body.code,
    description: body.description ?? undefined,
  });
  await repo.save(row);
  return created({ data: serializeRoute(row) });
}

export async function listRouteStops(req: Request): Promise<ControllerResult> {
  const stops = await RouteStop.find({
    where: { routeId: req.params.id },
    order: { sequenceOrder: 'ASC' },
  });
  return ok({ data: stops.map(serializeStop) });
}

export async function getDeliveryRoute(req: Request): Promise<ControllerResult> {
  const row = await DeliveryRoute.findOne({
    where: { id: req.params.id },
    relations: ['stops'],
  });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  const stops = (row.stops || []).slice().sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  return ok({ data: serializeRoute(row, stops) });
}

export async function updateDeliveryRoute(
  req: Request,
  body: UpdateDeliveryRouteInput
): Promise<ControllerResult> {
  const repo = DeliveryRoute.getRepository();
  const stopRepo = RouteStop.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (body.name !== undefined) row.name = body.name;
  if (body.code !== undefined) row.code = body.code;
  if (body.description !== undefined) row.description = body.description ?? undefined;
    await repo.save(row);

  if (body.stops) {
    for (const s of body.stops) {
      const hasCust = s.customerId != null;
      if (!hasCust && !String(s.addressLine ?? '').trim()) {
        throw new HttpError(400, { error: 'Each stop needs customerId or addressLine' });
      }
    }
    await stopRepo.delete({ routeId: row.id });
    for (const s of body.stops) {
      await stopRepo.save(
        stopRepo.create({
          routeId: row.id,
          sequenceOrder: s.sequenceOrder,
          customerId: s.customerId ?? undefined,
          addressLine: s.addressLine ?? undefined,
        })
      );
    }
  }

  const full = await repo.findOne({
    where: { id: row.id },
    relations: ['stops'],
  });
  if (!full) {
    throw new HttpError(404, { error: 'Not found' });
  }
  const stops = (full.stops || []).slice().sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  return ok({ data: serializeRoute(full, stops) });
}

export async function deleteDeliveryRoute(req: Request): Promise<ControllerResult> {
  try {
    const r = await DeliveryRoute.findOne({ where: { id: req.params.id } });
    if (!r) {
      throw new HttpError(404, { error: 'Not found' });
    }
    await DeliveryRoute.delete({ id: r.id });
    return ok({ data: { id: r.id, deleted: true } });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const msg = (e as Error).message;
    if (msg.includes('foreign key') || msg.includes('violates foreign key')) {
      throw new HttpError(400, {
        error: 'Route is referenced by delivery runs or customers; remove links first',
      });
    }
    throw new HttpError(400, { error: msg });
  }
}
