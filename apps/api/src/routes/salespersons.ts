import { Router } from 'express';
import { IsNull } from 'typeorm';
import { dataSource, Salesperson } from '@tradeflow/db';
import { createSalespersonSchema, updateSalespersonSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';

export const salespersonsRouter = Router();
salespersonsRouter.use(authMiddleware, loadUser);

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

salespersonsRouter.get('/', requirePermission('masters.salespersons', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const rows = await dataSource.getRepository(Salesperson).find({
    where: branchId ? [{ branchId: IsNull() }, { branchId }] : {},
    order: { name: 'ASC' },
  });
  res.json({ data: rows.map(serialize) });
});

salespersonsRouter.post(
  '/',
  requirePermission('masters.salespersons', 'write'),
  auditMiddleware({ entity: 'Salesperson', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createSalespersonSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const repo = dataSource.getRepository(Salesperson);
    const row = repo.create({
      name: b.name,
      code: b.code,
      branchId: b.branchId ?? req.user?.branchId ?? undefined,
    });
    await repo.save(row);
    res.status(201).json({ data: serialize(row) });
  }
);

salespersonsRouter.patch(
  '/:id',
  requirePermission('masters.salespersons', 'write'),
  auditMiddleware({
    entity: 'Salesperson',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => {
      const s = await dataSource.getRepository(Salesperson).findOne({ where: { id: req.params.id } });
      return s ? serialize(s) : undefined;
    },
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = updateSalespersonSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const repo = dataSource.getRepository(Salesperson);
    const row = await repo.findOne({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const b = parsed.data;
    if (b.name !== undefined) row.name = b.name;
    if (b.code !== undefined) row.code = b.code;
    if (b.branchId !== undefined) row.branchId = b.branchId ?? undefined;
    await repo.save(row);
    res.json({ data: serialize(row) });
  }
);

salespersonsRouter.delete(
  '/:id',
  requirePermission('masters.salespersons', 'write'),
  auditMiddleware({
    entity: 'Salesperson',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => {
      const s = await dataSource.getRepository(Salesperson).findOne({ where: { id: req.params.id } });
      return s ? serialize(s) : undefined;
    },
  }),
  async (req, res) => {
    const repo = dataSource.getRepository(Salesperson);
    const row = await repo.findOne({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    await repo.remove(row);
    res.json({ data: { id: row.id, deleted: true } });
  }
);
