import { Router } from 'express';
import { dataSource, DeliveryRoute, RouteStop } from '@tradeflow/db';
import {
  createDeliveryRouteSchema,
  updateDeliveryRouteSchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';

export const deliveryRoutesRouter = Router();
deliveryRoutesRouter.use(authMiddleware, loadUser);

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
    branchId: r.branchId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    stops: stops?.map(serializeStop),
  };
}

deliveryRoutesRouter.get('/', requirePermission('logistics.routes', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const { limit, offset } = getPagination(req);
  const qb = dataSource
    .getRepository(DeliveryRoute)
    .createQueryBuilder('r')
    .orderBy('r.code', 'ASC')
    .take(limit)
    .skip(offset);
  if (branchId) qb.andWhere('(r.branch_id IS NULL OR r.branch_id = :bid)', { bid: branchId });
  const [rows, total] = await qb.getManyAndCount();
  res.json({ data: rows.map((r) => serializeRoute(r)), meta: { total, limit, offset } });
});

deliveryRoutesRouter.post(
  '/',
  requirePermission('logistics.routes', 'write'),
  auditMiddleware({ entity: 'DeliveryRoute', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createDeliveryRouteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const repo = dataSource.getRepository(DeliveryRoute);
    const row = repo.create({
      name: b.name,
      code: b.code,
      description: b.description ?? undefined,
      branchId: b.branchId ?? req.user?.branchId ?? undefined,
    });
    await repo.save(row);
    res.status(201).json({ data: serializeRoute(row) });
  }
);

deliveryRoutesRouter.get('/:id/stops', requirePermission('logistics.routes', 'read'), async (req, res) => {
  const stops = await dataSource.getRepository(RouteStop).find({
    where: { routeId: req.params.id },
    order: { sequenceOrder: 'ASC' },
  });
  res.json({ data: stops.map(serializeStop) });
});

deliveryRoutesRouter.get('/:id', requirePermission('logistics.routes', 'read'), async (req, res) => {
  const row = await dataSource.getRepository(DeliveryRoute).findOne({
    where: { id: req.params.id },
    relations: ['stops'],
  });
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const stops = (row.stops || []).slice().sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  res.json({ data: serializeRoute(row, stops) });
});

deliveryRoutesRouter.patch(
  '/:id',
  requirePermission('logistics.routes', 'write'),
  auditMiddleware({
    entity: 'DeliveryRoute',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = updateDeliveryRouteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const repo = dataSource.getRepository(DeliveryRoute);
    const stopRepo = dataSource.getRepository(RouteStop);
    const row = await repo.findOne({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (b.name !== undefined) row.name = b.name;
    if (b.code !== undefined) row.code = b.code;
    if (b.description !== undefined) row.description = b.description ?? undefined;
    if (b.branchId !== undefined) row.branchId = b.branchId ?? undefined;
    await repo.save(row);

    if (b.stops) {
      for (const s of b.stops) {
        const hasCust = s.customerId != null;
        if (!hasCust && !String(s.addressLine ?? '').trim()) {
          res.status(400).json({ error: 'Each stop needs customerId or addressLine' });
          return;
        }
      }
      await stopRepo.delete({ routeId: row.id });
      for (const s of b.stops) {
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
    const stops = (full?.stops || []).slice().sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    res.json({ data: serializeRoute(full!, stops) });
  }
);

deliveryRoutesRouter.delete(
  '/:id',
  requirePermission('logistics.routes', 'write'),
  auditMiddleware({ entity: 'DeliveryRoute', getEntityId: (req) => req.params.id }),
  async (req, res) => {
    try {
      const r = await dataSource.getRepository(DeliveryRoute).findOne({ where: { id: req.params.id } });
      if (!r) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      await dataSource.getRepository(DeliveryRoute).delete({ id: r.id });
      res.json({ data: { id: r.id, deleted: true } });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('foreign key') || msg.includes('violates foreign key')) {
        res.status(400).json({ error: 'Route is referenced by delivery runs or customers; remove links first' });
        return;
      }
      res.status(400).json({ error: msg });
    }
  }
);
