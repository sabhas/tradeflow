import { Router } from 'express';
import { IsNull } from 'typeorm';
import { dataSource, TaxProfile } from '@tradeflow/db';
import { createTaxProfileSchema, updateTaxProfileSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';

export const taxProfilesRouter = Router();
taxProfilesRouter.use(authMiddleware, loadUser);

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

taxProfilesRouter.get('/', requirePermission('masters.tax', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const rows = await dataSource.getRepository(TaxProfile).find({
    where: branchId ? [{ branchId: IsNull() }, { branchId }] : {},
    order: { name: 'ASC' },
  });
  res.json({ data: rows.map(serialize) });
});

taxProfilesRouter.post(
  '/',
  requirePermission('masters.tax', 'write'),
  auditMiddleware({ entity: 'TaxProfile', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createTaxProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const repo = dataSource.getRepository(TaxProfile);
    const row = repo.create({
      name: b.name,
      rate: b.rate,
      isInclusive: b.isInclusive ?? false,
      region: b.region ?? undefined,
      branchId: b.branchId ?? req.user?.branchId ?? undefined,
    });
    await repo.save(row);
    res.status(201).json({ data: serialize(row) });
  }
);

taxProfilesRouter.patch(
  '/:id',
  requirePermission('masters.tax', 'write'),
  auditMiddleware({
    entity: 'TaxProfile',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => {
      const t = await dataSource.getRepository(TaxProfile).findOne({ where: { id: req.params.id } });
      return t ? serialize(t) : undefined;
    },
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = updateTaxProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const repo = dataSource.getRepository(TaxProfile);
    const row = await repo.findOne({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const b = parsed.data;
    if (b.name !== undefined) row.name = b.name;
    if (b.rate !== undefined) row.rate = b.rate;
    if (b.isInclusive !== undefined) row.isInclusive = b.isInclusive;
    if (b.region !== undefined) row.region = b.region ?? undefined;
    if (b.branchId !== undefined) row.branchId = b.branchId ?? undefined;
    await repo.save(row);
    res.json({ data: serialize(row) });
  }
);

taxProfilesRouter.delete(
  '/:id',
  requirePermission('masters.tax', 'write'),
  auditMiddleware({
    entity: 'TaxProfile',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => {
      const t = await dataSource.getRepository(TaxProfile).findOne({ where: { id: req.params.id } });
      return t ? serialize(t) : undefined;
    },
  }),
  async (req, res) => {
    const repo = dataSource.getRepository(TaxProfile);
    const row = await repo.findOne({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    await repo.remove(row);
    res.json({ data: { id: row.id, deleted: true } });
  }
);
