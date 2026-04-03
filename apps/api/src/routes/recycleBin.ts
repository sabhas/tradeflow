import { Router } from 'express';
import { EntityTarget, IsNull, Not } from 'typeorm';
import {
  dataSource,
  Product,
  Customer,
  Supplier,
  Invoice,
  JournalEntry,
  AuditLog,
} from '@tradeflow/db';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';

const ENTITY_TYPES = ['Product', 'Customer', 'Supplier', 'Invoice', 'JournalEntry'] as const;
type RecycleEntityType = (typeof ENTITY_TYPES)[number];

function parseEntityType(raw: unknown): RecycleEntityType | null {
  if (typeof raw !== 'string') return null;
  return ENTITY_TYPES.includes(raw as RecycleEntityType) ? (raw as RecycleEntityType) : null;
}

async function clearDeletedAtColumn<E extends object>(entity: EntityTarget<E>, id: string): Promise<void> {
  await dataSource
    .createQueryBuilder()
    .update(entity)
    .set({ deletedAt: null } as Record<string, unknown>)
    .where('id = :id', { id })
    .execute();
}

export const recycleBinRouter = Router();
recycleBinRouter.use(authMiddleware, loadUser);

recycleBinRouter.get('/', requirePermission('recycle_bin', 'read'), async (req, res) => {
  const entity = parseEntityType(req.query.entity);
  if (!entity) {
    res.status(400).json({
      error: 'Invalid entity',
      message: `Query "entity" must be one of: ${ENTITY_TYPES.join(', ')}`,
    });
    return;
  }
  const branchId = resolveBranchId(req);
  const { limit, offset } = getPagination(req);

  switch (entity) {
    case 'Product': {
      const qb = dataSource
        .getRepository(Product)
        .createQueryBuilder('p')
        .where('p.deleted_at IS NOT NULL')
        .orderBy('p.deleted_at', 'DESC')
        .take(limit)
        .skip(offset);
      if (branchId) qb.andWhere('(p.branch_id IS NULL OR p.branch_id = :bid)', { bid: branchId });
      const [rows, total] = await qb.getManyAndCount();
      res.json({
        data: rows.map((p) => ({
          id: p.id,
          label: `${p.sku} — ${p.name}`,
          deletedAt: p.deletedAt,
        })),
        meta: { total, limit, offset, entity },
      });
      return;
    }
    case 'Customer': {
      const qb = dataSource
        .getRepository(Customer)
        .createQueryBuilder('c')
        .where('c.deleted_at IS NOT NULL')
        .orderBy('c.deleted_at', 'DESC')
        .take(limit)
        .skip(offset);
      if (branchId) qb.andWhere('(c.branch_id IS NULL OR c.branch_id = :bid)', { bid: branchId });
      const [rows, total] = await qb.getManyAndCount();
      res.json({
        data: rows.map((c) => ({
          id: c.id,
          label: c.name,
          deletedAt: c.deletedAt,
        })),
        meta: { total, limit, offset, entity },
      });
      return;
    }
    case 'Supplier': {
      const qb = dataSource
        .getRepository(Supplier)
        .createQueryBuilder('s')
        .where('s.deleted_at IS NOT NULL')
        .orderBy('s.deleted_at', 'DESC')
        .take(limit)
        .skip(offset);
      if (branchId) qb.andWhere('(s.branch_id IS NULL OR s.branch_id = :bid)', { bid: branchId });
      const [rows, total] = await qb.getManyAndCount();
      res.json({
        data: rows.map((s) => ({
          id: s.id,
          label: s.name,
          deletedAt: s.deletedAt,
        })),
        meta: { total, limit, offset, entity },
      });
      return;
    }
    case 'Invoice': {
      const qb = dataSource
        .getRepository(Invoice)
        .createQueryBuilder('i')
        .where('i.deleted_at IS NOT NULL')
        .orderBy('i.deleted_at', 'DESC')
        .take(limit)
        .skip(offset);
      if (branchId) qb.andWhere('(i.branch_id IS NULL OR i.branch_id = :bid)', { bid: branchId });
      const [rows, total] = await qb.getManyAndCount();
      res.json({
        data: rows.map((i) => ({
          id: i.id,
          label: `${i.invoiceDate} · ${i.status} · ${i.total}`,
          deletedAt: i.deletedAt,
        })),
        meta: { total, limit, offset, entity },
      });
      return;
    }
    case 'JournalEntry': {
      const qb = dataSource
        .getRepository(JournalEntry)
        .createQueryBuilder('je')
        .where('je.deleted_at IS NOT NULL')
        .orderBy('je.deleted_at', 'DESC')
        .take(limit)
        .skip(offset);
      if (branchId) qb.andWhere('(je.branch_id IS NULL OR je.branch_id = :bid)', { bid: branchId });
      const [rows, total] = await qb.getManyAndCount();
      res.json({
        data: rows.map((je) => ({
          id: je.id,
          label: `${je.entryDate}${je.reference ? ` · ${je.reference}` : ''}${je.description ? ` — ${je.description.slice(0, 60)}` : ''}`,
          deletedAt: je.deletedAt,
        })),
        meta: { total, limit, offset, entity },
      });
      return;
    }
  }
});

recycleBinRouter.post(
  '/:entity/:id/restore',
  requirePermission('recycle_bin', 'restore'),
  async (req, res) => {
    const parsedEntity = parseEntityType(req.params.entity);
    if (!parsedEntity) {
      res.status(400).json({ error: 'Invalid entity path' });
      return;
    }
    const entityType: RecycleEntityType = parsedEntity;
    const { id } = req.params;
    if (!req.auth?.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const branchId = resolveBranchId(req);
    const auditRepo = dataSource.getRepository(AuditLog);

    async function logRestore(prevDeletedAt: Date | null | undefined) {
      await auditRepo.save({
        userId: req.auth!.userId,
        action: 'update',
        entity: entityType,
        entityId: id,
        oldValue: { deletedAt: prevDeletedAt?.toISOString() ?? null },
        newValue: { restored: true },
      });
    }

    switch (entityType) {
      case 'Product': {
        const row = await dataSource.getRepository(Product).findOne({
          where: { id, deletedAt: Not(IsNull()) },
        });
        if (!row) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        if (branchId && row.branchId && row.branchId !== branchId) {
          res.status(403).json({ error: 'Out of branch scope' });
          return;
        }
        const prev = row.deletedAt;
        await clearDeletedAtColumn(Product, id);
        await logRestore(prev ?? undefined);
        res.json({ data: { id, restored: true } });
        return;
      }
      case 'Customer': {
        const row = await dataSource.getRepository(Customer).findOne({
          where: { id, deletedAt: Not(IsNull()) },
        });
        if (!row) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        if (branchId && row.branchId && row.branchId !== branchId) {
          res.status(403).json({ error: 'Out of branch scope' });
          return;
        }
        const prev = row.deletedAt;
        await clearDeletedAtColumn(Customer, id);
        await logRestore(prev ?? undefined);
        res.json({ data: { id, restored: true } });
        return;
      }
      case 'Supplier': {
        const row = await dataSource.getRepository(Supplier).findOne({
          where: { id, deletedAt: Not(IsNull()) },
        });
        if (!row) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        if (branchId && row.branchId && row.branchId !== branchId) {
          res.status(403).json({ error: 'Out of branch scope' });
          return;
        }
        const prev = row.deletedAt;
        await clearDeletedAtColumn(Supplier, id);
        await logRestore(prev ?? undefined);
        res.json({ data: { id, restored: true } });
        return;
      }
      case 'Invoice': {
        const row = await dataSource.getRepository(Invoice).findOne({
          where: { id, deletedAt: Not(IsNull()) },
        });
        if (!row) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        if (row.status !== 'draft') {
          res.status(400).json({ error: 'Only draft invoices can be restored from recycle bin' });
          return;
        }
        if (branchId && row.branchId && row.branchId !== branchId) {
          res.status(403).json({ error: 'Out of branch scope' });
          return;
        }
        const prev = row.deletedAt;
        await clearDeletedAtColumn(Invoice, id);
        await logRestore(prev ?? undefined);
        res.json({ data: { id, restored: true } });
        return;
      }
      case 'JournalEntry': {
        const row = await dataSource.getRepository(JournalEntry).findOne({
          where: { id, deletedAt: Not(IsNull()) },
        });
        if (!row) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        if (row.status !== 'draft') {
          res.status(400).json({ error: 'Only draft journal entries can be restored' });
          return;
        }
        if (branchId && row.branchId && row.branchId !== branchId) {
          res.status(403).json({ error: 'Out of branch scope' });
          return;
        }
        const prev = row.deletedAt;
        await clearDeletedAtColumn(JournalEntry, id);
        await logRestore(prev ?? undefined);
        res.json({ data: { id, restored: true } });
        return;
      }
    }
  }
);
