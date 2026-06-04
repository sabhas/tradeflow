import type { Request } from 'express';
import type { z } from 'zod';
import { EntityTarget, IsNull, Not } from 'typeorm';
import { dataSource, Product, Customer, Supplier, Invoice, JournalEntry, AuditLog } from '@tradeflow/db';
import { listRecycleBinQuerySchema } from '@tradeflow/shared';
import { getValidatedQuery } from '../../../shared/middleware/validate';
import { getPaginationFromQuery } from '../../../shared/utils/pagination';
import { ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';

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

export async function listRecycleBin(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof listRecycleBinQuerySchema>>(req);
  const entity = q.entity;
  const { limit, offset } = getPaginationFromQuery(q);

  switch (entity) {
    case 'Product': {
      const qb = Product.createQueryBuilder('p')
        .where('p.deleted_at IS NOT NULL')
        .orderBy('p.deleted_at', 'DESC')
        .take(limit)
        .skip(offset);
      const [rows, total] = await qb.getManyAndCount();
      return ok({
        data: rows.map((p) => ({
          id: p.id,
          label: `${p.sku} — ${p.name}`,
          deletedAt: p.deletedAt,
        })),
        meta: { total, limit, offset, entity },
      });
    }
    case 'Customer': {
      const qb = Customer.createQueryBuilder('c')
        .where('c.deleted_at IS NOT NULL')
        .orderBy('c.deleted_at', 'DESC')
        .take(limit)
        .skip(offset);
      const [rows, total] = await qb.getManyAndCount();
      return ok({
        data: rows.map((c) => ({
          id: c.id,
          label: c.name,
          deletedAt: c.deletedAt,
        })),
        meta: { total, limit, offset, entity },
      });
    }
    case 'Supplier': {
      const qb = Supplier.createQueryBuilder('s')
        .where('s.deleted_at IS NOT NULL')
        .orderBy('s.deleted_at', 'DESC')
        .take(limit)
        .skip(offset);
      const [rows, total] = await qb.getManyAndCount();
      return ok({
        data: rows.map((s) => ({
          id: s.id,
          label: s.name,
          deletedAt: s.deletedAt,
        })),
        meta: { total, limit, offset, entity },
      });
    }
    case 'Invoice': {
      const qb = Invoice.createQueryBuilder('i')
        .where('i.deleted_at IS NOT NULL')
        .orderBy('i.deleted_at', 'DESC')
        .take(limit)
        .skip(offset);
      const [rows, total] = await qb.getManyAndCount();
      return ok({
        data: rows.map((i) => ({
          id: i.id,
          label: `${i.invoiceDate} · ${i.status} · ${i.total}`,
          deletedAt: i.deletedAt,
        })),
        meta: { total, limit, offset, entity },
      });
    }
    case 'JournalEntry': {
      const qb = JournalEntry.createQueryBuilder('je')
        .where('je.deleted_at IS NOT NULL')
        .orderBy('je.deleted_at', 'DESC')
        .take(limit)
        .skip(offset);
      const [rows, total] = await qb.getManyAndCount();
      return ok({
        data: rows.map((je) => ({
          id: je.id,
          label: `${je.entryDate}${je.reference ? ` · ${je.reference}` : ''}${je.description ? ` — ${je.description.slice(0, 60)}` : ''}`,
          deletedAt: je.deletedAt,
        })),
        meta: { total, limit, offset, entity },
      });
    }
  }
}

export async function restoreRecycleBinEntity(req: Request): Promise<ControllerResult> {
  const parsedEntity = parseEntityType(req.params.entity);
  if (!parsedEntity) {
    throw new HttpError(400, { error: 'Invalid entity path' });
  }
  const entityType: RecycleEntityType = parsedEntity;
  const { id } = req.params;
  if (!req.auth?.userId) {
    throw new HttpError(401, { error: 'Unauthorized' });
  }
  const auditRepo = AuditLog.getRepository();
  const userId = req.auth.userId;

  async function logRestore(prevDeletedAt: Date | null | undefined) {
    await auditRepo.save({
      userId,
      action: 'update',
      entity: entityType,
      entityId: id,
      oldValue: { deletedAt: prevDeletedAt?.toISOString() ?? null },
      newValue: { restored: true },
    });
  }

  switch (entityType) {
    case 'Product': {
      const row = await Product.findOne({
        where: { id, deletedAt: Not(IsNull()) },
      });
      if (!row) {
        throw new HttpError(404, { error: 'Not found' });
      }
      const prev = row.deletedAt;
      await clearDeletedAtColumn(Product, id);
      await logRestore(prev ?? undefined);
      return ok({ data: { id, restored: true } });
    }
    case 'Customer': {
      const row = await Customer.findOne({
        where: { id, deletedAt: Not(IsNull()) },
      });
      if (!row) {
        throw new HttpError(404, { error: 'Not found' });
      }
      const prev = row.deletedAt;
      await clearDeletedAtColumn(Customer, id);
      await logRestore(prev ?? undefined);
      return ok({ data: { id, restored: true } });
    }
    case 'Supplier': {
      const row = await Supplier.findOne({
        where: { id, deletedAt: Not(IsNull()) },
      });
      if (!row) {
        throw new HttpError(404, { error: 'Not found' });
      }
      const prev = row.deletedAt;
      await clearDeletedAtColumn(Supplier, id);
      await logRestore(prev ?? undefined);
      return ok({ data: { id, restored: true } });
    }
    case 'Invoice': {
      const row = await Invoice.findOne({
        where: { id, deletedAt: Not(IsNull()) },
      });
      if (!row) {
        throw new HttpError(404, { error: 'Not found' });
      }
      if (row.status !== 'draft') {
        throw new HttpError(400, { error: 'Only draft invoices can be restored from recycle bin' });
      }
      const prev = row.deletedAt;
      await clearDeletedAtColumn(Invoice, id);
      await logRestore(prev ?? undefined);
      return ok({ data: { id, restored: true } });
    }
    case 'JournalEntry': {
      const row = await JournalEntry.findOne({
        where: { id, deletedAt: Not(IsNull()) },
      });
      if (!row) {
        throw new HttpError(404, { error: 'Not found' });
      }
      if (row.status !== 'draft') {
        throw new HttpError(400, { error: 'Only draft journal entries can be restored' });
      }
      const prev = row.deletedAt;
      await clearDeletedAtColumn(JournalEntry, id);
      await logRestore(prev ?? undefined);
      return ok({ data: { id, restored: true } });
    }
  }
}
