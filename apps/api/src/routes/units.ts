import { Router } from 'express';
import { IsNull } from 'typeorm';
import { dataSource, UnitOfMeasure } from '@tradeflow/db';
import { createUnitSchema, updateUnitSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';

export const unitsRouter = Router();
unitsRouter.use(authMiddleware, loadUser);

function serialize(u: UnitOfMeasure) {
  return {
    id: u.id,
    code: u.code,
    name: u.name,
    branchId: u.branchId,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

unitsRouter.get('/', requirePermission('masters.products', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const rows = await dataSource.getRepository(UnitOfMeasure).find({
    where: branchId ? [{ branchId: IsNull() }, { branchId }] : {},
    order: { name: 'ASC' },
  });
  res.json({ data: rows.map(serialize) });
});

unitsRouter.post(
  '/',
  requirePermission('masters.products', 'write'),
  auditMiddleware({ entity: 'UnitOfMeasure', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createUnitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const repo = dataSource.getRepository(UnitOfMeasure);
    const row = repo.create({
      code: b.code,
      name: b.name,
      branchId: b.branchId ?? req.user?.branchId ?? undefined,
    });
    await repo.save(row);
    res.status(201).json({ data: serialize(row) });
  }
);

unitsRouter.patch(
  '/:id',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'UnitOfMeasure',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => {
      const u = await dataSource.getRepository(UnitOfMeasure).findOne({ where: { id: req.params.id } });
      return u ? serialize(u) : undefined;
    },
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = updateUnitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const repo = dataSource.getRepository(UnitOfMeasure);
    const row = await repo.findOne({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const b = parsed.data;
    if (b.code !== undefined) row.code = b.code;
    if (b.name !== undefined) row.name = b.name;
    if (b.branchId !== undefined) row.branchId = b.branchId ?? undefined;
    await repo.save(row);
    res.json({ data: serialize(row) });
  }
);

unitsRouter.delete(
  '/:id',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'UnitOfMeasure',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => {
      const u = await dataSource.getRepository(UnitOfMeasure).findOne({ where: { id: req.params.id } });
      return u ? serialize(u) : undefined;
    },
  }),
  async (req, res) => {
    const repo = dataSource.getRepository(UnitOfMeasure);
    const row = await repo.findOne({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    await repo.remove(row);
    res.json({ data: { id: row.id, deleted: true } });
  }
);
