import { Request, Router } from 'express';
import { In } from 'typeorm';
import {
  dataSource,
  DeliveryNote,
  DeliveryNoteLine,
  DeliveryRunItem,
  Invoice,
  ProofOfDelivery,
  SalesOrder,
  SalesOrderLine,
} from '@tradeflow/db';
import {
  createDeliveryNoteSchema,
  updateDeliveryNoteSchema,
  proofOfDeliverySchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';

export const deliveryNotesRouter = Router();
deliveryNotesRouter.use(authMiddleware, loadUser);

function canWritePod(req: Request): boolean {
  const p = req.auth?.permissions ?? [];
  return p.includes('*') || p.includes('logistics.pod:write') || p.includes('logistics.deliveries:write');
}

function serializeLine(l: DeliveryNoteLine) {
  return {
    id: l.id,
    deliveryNoteId: l.deliveryNoteId,
    productId: l.productId,
    quantity: l.quantity,
    invoiceLineId: l.invoiceLineId,
    salesOrderLineId: l.salesOrderLineId,
  };
}

function serializePod(p: ProofOfDelivery) {
  return {
    id: p.id,
    deliveryNoteId: p.deliveryNoteId,
    type: p.type,
    reference: p.reference,
    notes: p.notes,
    createdAt: p.createdAt,
  };
}

function serializeNote(
  n: DeliveryNote,
  extras?: { lines?: DeliveryNoteLine[]; pods?: ProofOfDelivery[]; deliveryRunId?: string | null }
) {
  return {
    id: n.id,
    invoiceId: n.invoiceId,
    salesOrderId: n.salesOrderId,
    deliveryDate: n.deliveryDate,
    status: n.status,
    warehouseId: n.warehouseId,
    branchId: n.branchId,
    createdBy: n.createdBy,
    coldChainRequired: n.coldChainRequired,
    controlledDeliveryRequired: n.controlledDeliveryRequired,
    dispatchComplianceNote: n.dispatchComplianceNote,
    deliveryComplianceNote: n.deliveryComplianceNote,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    lines: extras?.lines?.map(serializeLine),
    proofOfDeliveries: extras?.pods?.map(serializePod),
    deliveryRunId: extras?.deliveryRunId,
  };
}

deliveryNotesRouter.get('/', requirePermission('logistics.deliveries', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const { limit, offset } = getPagination(req);
  const qb = dataSource
    .getRepository(DeliveryNote)
    .createQueryBuilder('n')
    .orderBy('n.created_at', 'DESC')
    .take(limit)
    .skip(offset);
  if (branchId) qb.andWhere('(n.branch_id IS NULL OR n.branch_id = :bid)', { bid: branchId });
  if (req.query.status) qb.andWhere('n.status = :st', { st: req.query.status });
  if (req.query.dateFrom) qb.andWhere('(n.delivery_date IS NULL OR n.delivery_date >= :df)', {
    df: req.query.dateFrom,
  });
  if (req.query.dateTo) qb.andWhere('(n.delivery_date IS NULL OR n.delivery_date <= :dt)', {
    dt: req.query.dateTo,
  });
  const runFilter = (req.query.deliveryRunId as string)?.trim();
  if (runFilter) {
    qb.innerJoin(DeliveryRunItem, 'dri', 'dri.delivery_note_id = n.id AND dri.delivery_run_id = :drid', {
      drid: runFilter,
    });
  }
  const [rows, total] = await qb.getManyAndCount();
  const ids = rows.map((r) => r.id);
  const runByNote = new Map<string, string>();
  if (ids.length) {
    const links = await dataSource.getRepository(DeliveryRunItem).find({
      where: { deliveryNoteId: In(ids) },
    });
    for (const l of links) runByNote.set(l.deliveryNoteId, l.deliveryRunId);
  }
  res.json({
    data: rows.map((n) => serializeNote(n, { deliveryRunId: runByNote.get(n.id) ?? null })),
    meta: { total, limit, offset },
  });
});

deliveryNotesRouter.get('/:id', requirePermission('logistics.deliveries', 'read'), async (req, res) => {
  const row = await dataSource.getRepository(DeliveryNote).findOne({
    where: { id: req.params.id },
    relations: ['lines', 'proofOfDeliveries'],
  });
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const link = await dataSource.getRepository(DeliveryRunItem).findOne({
    where: { deliveryNoteId: row.id },
  });
  res.json({
    data: serializeNote(row, {
      lines: row.lines,
      pods: row.proofOfDeliveries,
      deliveryRunId: link?.deliveryRunId ?? null,
    }),
  });
});

deliveryNotesRouter.post(
  '/',
  requirePermission('logistics.deliveries', 'write'),
  auditMiddleware({ entity: 'DeliveryNote', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createDeliveryNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    try {
      const saved = await dataSource.transaction(async (manager) => {
        if (b.invoiceId) {
          const inv = await manager.findOne(Invoice, {
            where: { id: b.invoiceId },
            relations: ['lines'],
          });
          if (!inv) throw new Error('Invoice not found');
          const lineInputs: Array<{
            productId: string;
            quantity: string;
            invoiceLineId: string;
          }> = [];
          if (b.lines?.length) {
            for (const raw of b.lines) {
              if (!raw.invoiceLineId) throw new Error('Each line needs invoiceLineId for invoice-based DN');
              const il = inv.lines?.find((x) => x.id === raw.invoiceLineId);
              if (!il) throw new Error(`Unknown invoice line ${raw.invoiceLineId}`);
              const qty = parseFloat(String(raw.quantity));
              if (qty <= 0) throw new Error('Quantity must be positive');
              if (qty > parseFloat(il.quantity) + 1e-9) throw new Error('Quantity exceeds invoice line');
              lineInputs.push({
                productId: il.productId,
                quantity: String(raw.quantity),
                invoiceLineId: il.id,
              });
            }
          } else if (inv.lines?.length) {
            for (const il of inv.lines) {
              lineInputs.push({
                productId: il.productId,
                quantity: il.quantity,
                invoiceLineId: il.id,
              });
            }
          } else throw new Error('Invoice has no lines');
          const note = manager.create(DeliveryNote, {
            invoiceId: inv.id,
            deliveryDate: b.deliveryDate?.slice(0, 10) ?? undefined,
            status: 'pending',
            warehouseId: b.warehouseId ?? inv.warehouseId,
            branchId: b.branchId ?? inv.branchId ?? req.user?.branchId ?? undefined,
            createdBy: req.auth?.userId,
            coldChainRequired: b.coldChainRequired ?? false,
            controlledDeliveryRequired: b.controlledDeliveryRequired ?? false,
          });
          await manager.save(note);
          for (const li of lineInputs) {
            await manager.save(
              manager.create(DeliveryNoteLine, {
                deliveryNoteId: note.id,
                productId: li.productId,
                quantity: li.quantity,
                invoiceLineId: li.invoiceLineId,
              })
            );
          }
          return manager.findOneOrFail(DeliveryNote, {
            where: { id: note.id },
            relations: ['lines', 'proofOfDeliveries'],
          });
        }

        const so = await manager.findOne(SalesOrder, {
          where: { id: b.salesOrderId! },
          relations: ['lines'],
        });
        if (!so) throw new Error('Sales order not found');
        const lineInputs: Array<{
          productId: string;
          quantity: string;
          salesOrderLineId: string;
        }> = [];
        if (b.lines?.length) {
          for (const raw of b.lines) {
            if (!raw.salesOrderLineId) throw new Error('Each line needs salesOrderLineId for order-based DN');
            const sl = so.lines?.find((x) => x.id === raw.salesOrderLineId);
            if (!sl) throw new Error(`Unknown sales order line ${raw.salesOrderLineId}`);
            const qty = parseFloat(String(raw.quantity));
            if (qty <= 0) throw new Error('Quantity must be positive');
            const rem = parseFloat(sl.quantity) - parseFloat(sl.deliveredQuantity) + 1e-9;
            if (qty > rem) throw new Error('Quantity exceeds remaining on sales order line');
            lineInputs.push({
              productId: sl.productId,
              quantity: String(raw.quantity),
              salesOrderLineId: sl.id,
            });
          }
        } else if (so.lines?.length) {
          for (const sl of so.lines) {
            const rem = parseFloat(sl.quantity) - parseFloat(sl.deliveredQuantity);
            if (rem <= 1e-9) continue;
            lineInputs.push({
              productId: sl.productId,
              quantity: rem.toFixed(4),
              salesOrderLineId: sl.id,
            });
          }
        }
        if (!lineInputs.length) throw new Error('No deliverable lines on sales order');
        const note = manager.create(DeliveryNote, {
          salesOrderId: so.id,
          deliveryDate: b.deliveryDate?.slice(0, 10) ?? undefined,
          status: 'pending',
          warehouseId: b.warehouseId ?? so.warehouseId,
          branchId: b.branchId ?? so.branchId ?? req.user?.branchId ?? undefined,
          createdBy: req.auth?.userId,
          coldChainRequired: b.coldChainRequired ?? false,
          controlledDeliveryRequired: b.controlledDeliveryRequired ?? false,
        });
        await manager.save(note);
        for (const li of lineInputs) {
          await manager.save(
            manager.create(DeliveryNoteLine, {
              deliveryNoteId: note.id,
              productId: li.productId,
              quantity: li.quantity,
              salesOrderLineId: li.salesOrderLineId,
            })
          );
        }
        return manager.findOneOrFail(DeliveryNote, {
          where: { id: note.id },
          relations: ['lines', 'proofOfDeliveries'],
        });
      });
      const link = await dataSource.getRepository(DeliveryRunItem).findOne({
        where: { deliveryNoteId: saved.id },
      });
      res.status(201).json({
        data: serializeNote(saved, {
          lines: saved.lines,
          pods: saved.proofOfDeliveries,
          deliveryRunId: link?.deliveryRunId ?? null,
        }),
      });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);

deliveryNotesRouter.patch(
  '/:id',
  requirePermission('logistics.deliveries', 'write'),
  auditMiddleware({
    entity: 'DeliveryNote',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = updateDeliveryNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const repo = dataSource.getRepository(DeliveryNote);
    const row = await repo.findOne({
      where: { id: req.params.id },
      relations: ['lines', 'proofOfDeliveries'],
    });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (b.deliveryDate !== undefined) row.deliveryDate = b.deliveryDate?.slice(0, 10) ?? undefined;
    if (b.status !== undefined) row.status = b.status;
    if (b.warehouseId !== undefined) row.warehouseId = b.warehouseId ?? undefined;
    if (b.branchId !== undefined) row.branchId = b.branchId ?? undefined;
    if (b.coldChainRequired !== undefined) row.coldChainRequired = b.coldChainRequired;
    if (b.controlledDeliveryRequired !== undefined) row.controlledDeliveryRequired = b.controlledDeliveryRequired;
    if (b.dispatchComplianceNote !== undefined) row.dispatchComplianceNote = b.dispatchComplianceNote ?? undefined;
    if (b.deliveryComplianceNote !== undefined) row.deliveryComplianceNote = b.deliveryComplianceNote ?? undefined;
    await repo.save(row);
    const link = await dataSource.getRepository(DeliveryRunItem).findOne({
      where: { deliveryNoteId: row.id },
    });
    res.json({
      data: serializeNote(row, {
        lines: row.lines,
        pods: row.proofOfDeliveries,
        deliveryRunId: link?.deliveryRunId ?? null,
      }),
    });
  }
);

deliveryNotesRouter.post('/:id/pod', async (req, res) => {
  if (!canWritePod(req)) {
    res.status(403).json({ error: 'Forbidden', message: 'logistics.pod:write or logistics.deliveries:write required' });
    return;
  }
  const parsed = proofOfDeliverySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }
  const note = await dataSource.getRepository(DeliveryNote).findOne({ where: { id: req.params.id } });
  if (!note) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const pod = dataSource.getRepository(ProofOfDelivery).create({
    deliveryNoteId: note.id,
    type: parsed.data.type,
    reference: parsed.data.reference,
    notes: parsed.data.notes ?? undefined,
  });
  await dataSource.getRepository(ProofOfDelivery).save(pod);
  note.status = 'delivered';
  await dataSource.getRepository(DeliveryNote).save(note);
  const full = await dataSource.getRepository(DeliveryNote).findOne({
    where: { id: note.id },
    relations: ['lines', 'proofOfDeliveries'],
  });
  const link = await dataSource.getRepository(DeliveryRunItem).findOne({
    where: { deliveryNoteId: note.id },
  });
  res.status(201).json({
    data: {
      proofOfDelivery: serializePod(pod),
      deliveryNote: serializeNote(full!, {
        lines: full?.lines,
        pods: full?.proofOfDeliveries,
        deliveryRunId: link?.deliveryRunId ?? null,
      }),
    },
  });
});

deliveryNotesRouter.delete(
  '/:id',
  requirePermission('logistics.deliveries', 'write'),
  auditMiddleware({ entity: 'DeliveryNote', getEntityId: (req) => req.params.id }),
  async (req, res) => {
    const row = await dataSource.getRepository(DeliveryNote).findOne({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (row.status === 'delivered') {
      res.status(400).json({ error: 'Delivered notes cannot be deleted' });
      return;
    }
    await dataSource.getRepository(DeliveryRunItem).delete({ deliveryNoteId: row.id });
    await dataSource.getRepository(DeliveryNote).delete({ id: row.id });
    res.json({ data: { id: row.id, deleted: true } });
  }
);
