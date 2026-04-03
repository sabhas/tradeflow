import { Router } from 'express';
import { In } from 'typeorm';
import { dataSource, DeliveryNote, DeliveryRun, DeliveryRunItem, DeliveryRoute } from '@tradeflow/db';
import { createDeliveryRunSchema, updateDeliveryRunSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';

export const deliveryRunsRouter = Router();
deliveryRunsRouter.use(authMiddleware, loadUser);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function replaceRunItems(runId: string, noteIds: string[]): Promise<void> {
  await dataSource.transaction(async (manager) => {
    if (noteIds.length) {
      await manager
        .createQueryBuilder()
        .delete()
        .from(DeliveryRunItem)
        .where('delivery_run_id = :rid OR delivery_note_id IN (:...nids)', {
          rid: runId,
          nids: noteIds,
        })
        .execute();
      for (const nid of noteIds) {
        await manager.save(
          manager.create(DeliveryRunItem, { deliveryRunId: runId, deliveryNoteId: nid })
        );
      }
    } else {
      await manager.delete(DeliveryRunItem, { deliveryRunId: runId });
    }
  });
}

function serializeRun(
  r: DeliveryRun,
  extras?: { noteIds?: string[]; routeCode?: string; routeName?: string }
) {
  return {
    id: r.id,
    runDate: r.runDate,
    routeId: r.routeId,
    routeCode: extras?.routeCode,
    routeName: extras?.routeName,
    vehicleInfo: r.vehicleInfo,
    driverSalespersonId: r.driverSalespersonId,
    status: r.status,
    branchId: r.branchId,
    createdBy: r.createdBy,
    coldChainRequired: r.coldChainRequired,
    controlledDeliveryRequired: r.controlledDeliveryRequired,
    dispatchComplianceNote: r.dispatchComplianceNote,
    deliveryComplianceNote: r.deliveryComplianceNote,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deliveryNoteIds: extras?.noteIds,
  };
}

deliveryRunsRouter.get('/', requirePermission('logistics.deliveries', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const { limit, offset } = getPagination(req);
  const qb = dataSource
    .getRepository(DeliveryRun)
    .createQueryBuilder('r')
    .leftJoinAndSelect('r.route', 'rt')
    .orderBy('r.run_date', 'DESC')
    .addOrderBy('r.created_at', 'DESC')
    .take(limit)
    .skip(offset);
  if (branchId) qb.andWhere('(r.branch_id IS NULL OR r.branch_id = :bid)', { bid: branchId });
  if (req.query.routeId) qb.andWhere('r.route_id = :rid', { rid: req.query.routeId });
  if (req.query.runDate) qb.andWhere('r.run_date = :rd', { rd: req.query.runDate });
  const [rows, total] = await qb.getManyAndCount();
  const ids = rows.map((x) => x.id);
  const noteMap = new Map<string, string[]>();
  if (ids.length) {
    const items = await dataSource.getRepository(DeliveryRunItem).find({
      where: { deliveryRunId: In(ids) },
    });
    for (const it of items) {
      const cur = noteMap.get(it.deliveryRunId) ?? [];
      cur.push(it.deliveryNoteId);
      noteMap.set(it.deliveryRunId, cur);
    }
  }
  const data = rows.map((r) =>
    serializeRun(r, {
      noteIds: noteMap.get(r.id),
      routeCode: r.route?.code,
      routeName: r.route?.name,
    })
  );
  res.json({ data, meta: { total, limit, offset } });
});

deliveryRunsRouter.get('/:id/sheet', requirePermission('logistics.deliveries', 'read'), async (req, res) => {
  const run = await dataSource.getRepository(DeliveryRun).findOne({
    where: { id: req.params.id },
    relations: ['route', 'driverSalesperson'],
  });
  if (!run) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const items = await dataSource.getRepository(DeliveryRunItem).find({
    where: { deliveryRunId: run.id },
  });
  const noteIds = items.map((i) => i.deliveryNoteId);
  const notes =
    noteIds.length === 0
      ? []
      : await dataSource.getRepository(DeliveryNote).find({
          where: { id: In(noteIds) },
          relations: ['invoice', 'invoice.customer', 'salesOrder', 'salesOrder.customer'],
        });
  const rows = notes
    .map((n) => {
      const inv = n.invoice;
      const so = n.salesOrder;
      const cust = inv?.customer || so?.customer;
      const name = cust?.name ?? '—';
      const addr =
        (cust?.contact && typeof cust.contact === 'object' && 'address' in cust.contact
          ? String((cust.contact as { address?: string }).address ?? '')
          : '') || '—';
      const ref = n.invoiceId ? `Invoice ${n.invoiceId.slice(0, 8)}` : `Order ${n.salesOrderId?.slice(0, 8)}`;
      return `<tr><td>${escapeHtml(ref)}</td><td>${escapeHtml(name)}</td><td>${escapeHtml(addr)}</td><td>${n.status}</td></tr>`;
    })
    .join('');
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Run sheet</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 900px; margin: 24px auto; color: #111; }
  h1 { font-size: 1.25rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #ccc; padding: 8px; font-size: 13px; }
  th { background: #f4f4f5; text-align: left; }
</style></head><body>
  <h1>Delivery run</h1>
  <p>Date: ${run.runDate} · Route: ${escapeHtml(run.route?.name ?? run.routeId)} · Vehicle: ${escapeHtml(run.vehicleInfo ?? '—')}</p>
  <table>
    <thead><tr><th>Ref</th><th>Customer</th><th>Address</th><th>DN status</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4">No delivery notes</td></tr>'}</tbody>
  </table>
  <script>window.onload = function() { window.print(); }</script>
</body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

deliveryRunsRouter.get('/:id', requirePermission('logistics.deliveries', 'read'), async (req, res) => {
  const row = await dataSource.getRepository(DeliveryRun).findOne({
    where: { id: req.params.id },
    relations: ['route', 'driverSalesperson'],
  });
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const items = await dataSource.getRepository(DeliveryRunItem).find({
    where: { deliveryRunId: row.id },
  });
  res.json({
    data: serializeRun(row, {
      noteIds: items.map((i) => i.deliveryNoteId),
      routeCode: row.route?.code,
      routeName: row.route?.name,
    }),
  });
});

deliveryRunsRouter.post(
  '/',
  requirePermission('logistics.deliveries', 'write'),
  auditMiddleware({ entity: 'DeliveryRun', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createDeliveryRunSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    try {
      const route = await dataSource.getRepository(DeliveryRoute).findOne({ where: { id: b.routeId } });
      if (!route) throw new Error('Route not found');
      const run = dataSource.getRepository(DeliveryRun).create({
        runDate: b.runDate.slice(0, 10),
        routeId: b.routeId,
        vehicleInfo: b.vehicleInfo ?? undefined,
        driverSalespersonId: b.driverSalespersonId ?? undefined,
        status: b.status ?? 'draft',
        branchId: b.branchId ?? req.user?.branchId ?? undefined,
        createdBy: req.auth?.userId,
        coldChainRequired: b.coldChainRequired ?? false,
        controlledDeliveryRequired: b.controlledDeliveryRequired ?? false,
        dispatchComplianceNote: b.dispatchComplianceNote ?? undefined,
        deliveryComplianceNote: b.deliveryComplianceNote ?? undefined,
      });
      await dataSource.getRepository(DeliveryRun).save(run);
      if (b.deliveryNoteIds?.length) {
        await replaceRunItems(run.id, b.deliveryNoteIds);
      }
      const full = await dataSource.getRepository(DeliveryRun).findOne({
        where: { id: run.id },
        relations: ['route'],
      });
      const items = await dataSource.getRepository(DeliveryRunItem).find({
        where: { deliveryRunId: run.id },
      });
      res.status(201).json({
        data: serializeRun(full!, {
          noteIds: items.map((i) => i.deliveryNoteId),
          routeCode: full?.route?.code,
          routeName: full?.route?.name,
        }),
      });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);

deliveryRunsRouter.patch(
  '/:id',
  requirePermission('logistics.deliveries', 'write'),
  auditMiddleware({
    entity: 'DeliveryRun',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = updateDeliveryRunSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    try {
      const repo = dataSource.getRepository(DeliveryRun);
      const row = await repo.findOne({ where: { id: req.params.id }, relations: ['route'] });
      if (!row) throw new Error('Not found');
      if (b.runDate !== undefined) row.runDate = b.runDate.slice(0, 10);
      if (b.routeId !== undefined) row.routeId = b.routeId;
      if (b.vehicleInfo !== undefined) row.vehicleInfo = b.vehicleInfo ?? undefined;
      if (b.driverSalespersonId !== undefined) row.driverSalespersonId = b.driverSalespersonId ?? undefined;
      if (b.status !== undefined) row.status = b.status;
      if (b.branchId !== undefined) row.branchId = b.branchId ?? undefined;
      if (b.coldChainRequired !== undefined) row.coldChainRequired = b.coldChainRequired;
      if (b.controlledDeliveryRequired !== undefined) row.controlledDeliveryRequired = b.controlledDeliveryRequired;
      if (b.dispatchComplianceNote !== undefined) row.dispatchComplianceNote = b.dispatchComplianceNote ?? undefined;
      if (b.deliveryComplianceNote !== undefined) row.deliveryComplianceNote = b.deliveryComplianceNote ?? undefined;
      await repo.save(row);
      if (b.deliveryNoteIds !== undefined) {
        await replaceRunItems(row.id, b.deliveryNoteIds);
      }
      const items = await dataSource.getRepository(DeliveryRunItem).find({
        where: { deliveryRunId: row.id },
      });
      const full = await repo.findOne({ where: { id: row.id }, relations: ['route'] });
      res.json({
        data: serializeRun(full!, {
          noteIds: items.map((i) => i.deliveryNoteId),
          routeCode: full?.route?.code,
          routeName: full?.route?.name,
        }),
      });
    } catch (e) {
      const msg = (e as Error).message;
      res.status(msg === 'Not found' ? 404 : 400).json({ error: msg });
    }
  }
);

deliveryRunsRouter.delete(
  '/:id',
  requirePermission('logistics.deliveries', 'write'),
  auditMiddleware({ entity: 'DeliveryRun', getEntityId: (req) => req.params.id }),
  async (req, res) => {
    const row = await dataSource.getRepository(DeliveryRun).findOne({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (row.status !== 'draft' && row.status !== 'cancelled') {
      res.status(400).json({ error: 'Only draft or cancelled runs can be deleted' });
      return;
    }
    await dataSource.getRepository(DeliveryRunItem).delete({ deliveryRunId: row.id });
    await dataSource.getRepository(DeliveryRun).delete({ id: row.id });
    res.json({ data: { id: row.id, deleted: true } });
  }
);
