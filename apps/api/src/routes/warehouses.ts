import { Router } from 'express';
import { IsNull } from 'typeorm';
import { dataSource, Warehouse, Branch } from '@tradeflow/db';
import { createWarehouseSchema, updateWarehouseSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';

export const warehousesRouter = Router();
warehousesRouter.use(authMiddleware, loadUser);

function serialize(w: Warehouse) {
  return {
    id: w.id,
    name: w.name,
    code: w.code,
    branchId: w.branchId,
    isDefault: w.isDefault,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

async function ensureDefaultWarehouse() {
  const repo = dataSource.getRepository(Warehouse);
  const count = await repo.count();
  if (count > 0) return;
  let branch = await dataSource.getRepository(Branch).findOne({ where: { code: 'MAIN' } });
  if (!branch) {
    branch = await dataSource.getRepository(Branch).save(
      dataSource.getRepository(Branch).create({ name: 'Main', code: 'MAIN' })
    );
  }
  await repo.save(
    repo.create({
      name: 'Main',
      code: 'MAIN',
      branchId: branch.id,
      isDefault: true,
    })
  );
}

warehousesRouter.get('/', requirePermission('masters.warehouses', 'read'), async (req, res) => {
  await ensureDefaultWarehouse();
  const branchId = resolveBranchId(req);
  const rows = await dataSource.getRepository(Warehouse).find({
    where: branchId ? [{ branchId: IsNull() }, { branchId }] : {},
    order: { name: 'ASC' },
  });
  res.json({ data: rows.map(serialize) });
});

warehousesRouter.get('/:id', requirePermission('masters.warehouses', 'read'), async (req, res) => {
  const row = await dataSource.getRepository(Warehouse).findOne({ where: { id: req.params.id } });
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ data: serialize(row) });
});

warehousesRouter.post(
  '/',
  requirePermission('masters.warehouses', 'write'),
  auditMiddleware({ entity: 'Warehouse', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createWarehouseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const repo = dataSource.getRepository(Warehouse);
    if (b.isDefault) {
      await repo.createQueryBuilder().update(Warehouse).set({ isDefault: false }).execute();
    }
    const row = repo.create({
      name: b.name,
      code: b.code,
      branchId: b.branchId ?? req.user?.branchId ?? undefined,
      isDefault: b.isDefault ?? false,
    });
    await repo.save(row);
    res.status(201).json({ data: serialize(row) });
  }
);

warehousesRouter.patch(
  '/:id',
  requirePermission('masters.warehouses', 'write'),
  auditMiddleware({
    entity: 'Warehouse',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => {
      const w = await dataSource.getRepository(Warehouse).findOne({ where: { id: req.params.id } });
      return w ? serialize(w) : undefined;
    },
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = updateWarehouseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const repo = dataSource.getRepository(Warehouse);
    const row = await repo.findOne({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const b = parsed.data;
    if (b.isDefault) {
      await repo
        .createQueryBuilder()
        .update(Warehouse)
        .set({ isDefault: false })
        .where('id <> :id', { id: row.id })
        .execute();
    }
    if (b.name !== undefined) row.name = b.name;
    if (b.code !== undefined) row.code = b.code;
    if (b.branchId !== undefined) row.branchId = b.branchId ?? undefined;
    if (b.isDefault !== undefined) row.isDefault = b.isDefault;
    await repo.save(row);
    res.json({ data: serialize(row) });
  }
);
