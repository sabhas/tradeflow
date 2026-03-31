import { Router } from 'express';
import { IsNull } from 'typeorm';
import { dataSource, PriceLevel } from '@tradeflow/db';
import { createPriceLevelSchema, updatePriceLevelSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';

export const priceLevelsRouter = Router();
priceLevelsRouter.use(authMiddleware, loadUser);

function serialize(p: PriceLevel) {
  return {
    id: p.id,
    name: p.name,
    branchId: p.branchId,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

priceLevelsRouter.get('/', requirePermission('masters.products', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const rows = await dataSource.getRepository(PriceLevel).find({
    where: branchId ? [{ branchId: IsNull() }, { branchId }] : {},
    order: { name: 'ASC' },
  });
  res.json({ data: rows.map(serialize) });
});

priceLevelsRouter.post(
  '/',
  requirePermission('masters.products', 'write'),
  auditMiddleware({ entity: 'PriceLevel', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createPriceLevelSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const repo = dataSource.getRepository(PriceLevel);
    const row = repo.create({
      name: b.name,
      branchId: b.branchId ?? req.user?.branchId ?? undefined,
    });
    await repo.save(row);
    res.status(201).json({ data: serialize(row) });
  }
);

priceLevelsRouter.patch(
  '/:id',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'PriceLevel',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => {
      const p = await dataSource.getRepository(PriceLevel).findOne({ where: { id: req.params.id } });
      return p ? serialize(p) : undefined;
    },
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = updatePriceLevelSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const repo = dataSource.getRepository(PriceLevel);
    const row = await repo.findOne({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const b = parsed.data;
    if (b.name !== undefined) row.name = b.name;
    if (b.branchId !== undefined) row.branchId = b.branchId ?? undefined;
    await repo.save(row);
    res.json({ data: serialize(row) });
  }
);
