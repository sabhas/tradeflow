// @ts-nocheck
import type { Request } from 'express';
import { In } from 'typeorm';
import type { z } from 'zod';
import { dataSource, DeliveryNote, DeliveryRun, DeliveryRunItem, DeliveryRoute } from '@tradeflow/db';
import { createDeliveryRunSchema, updateDeliveryRunSchema } from '@tradeflow/shared';
import { getPagination } from '../utils/pagination';
import { created, htmlOk, ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

type CreateDeliveryRunInput = z.infer<typeof createDeliveryRunSchema>;
type UpdateDeliveryRunInput = z.infer<typeof updateDeliveryRunSchema>;

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

function serializeDeliveryRun(
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

export async function listDeliveryRuns(req: Request): Promise<ControllerResult> {
  const branchId = undefined;
  const { limit, offset } = getPagination(req);
  const qb = DeliveryRun
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
    const items = await DeliveryRunItem.find({
      where: { deliveryRunId: In(ids) },
    });
    for (const it of items) {
      const cur = noteMap.get(it.deliveryRunId) ?? [];
      cur.push(it.deliveryNoteId);
      noteMap.set(it.deliveryRunId, cur);
    }
  }
  const data = rows.map((r) =>
    serializeDeliveryRun(r, {
      noteIds: noteMap.get(r.id),
      routeCode: r.route?.code,
      routeName: r.route?.name,
    })
  );
  return ok({ data, meta: { total, limit, offset } });
}

export async function getDeliveryRunSheet(req: Request): Promise<ControllerResult> {
  const run = await DeliveryRun.findOne({
    where: { id: req.params.id },
    relations: ['route', 'driverSalesperson'],
  });
  if (!run) {
    throw new HttpError(404, { error: 'Not found' });
  }
  const items = await DeliveryRunItem.find({
    where: { deliveryRunId: run.id },
  });
  const noteIds = items.map((i) => i.deliveryNoteId);
  const notes =
    noteIds.length === 0
      ? []
      : await DeliveryNote.find({
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
  return htmlOk(html);
}

export async function getDeliveryRun(req: Request): Promise<ControllerResult> {
  const row = await DeliveryRun.findOne({
    where: { id: req.params.id },
    relations: ['route', 'driverSalesperson'],
  });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  const items = await DeliveryRunItem.find({
    where: { deliveryRunId: row.id },
  });
  return ok({
    data: serializeDeliveryRun(row, {
      noteIds: items.map((i) => i.deliveryNoteId),
      routeCode: row.route?.code,
      routeName: row.route?.name,
    }),
  });
}

export async function createDeliveryRun(req: Request, body: CreateDeliveryRunInput): Promise<ControllerResult> {
  const b = body;
  try {
    const route = await DeliveryRoute.findOne({ where: { id: b.routeId } });
    if (!route) throw new HttpError(400, { error: 'Route not found' });
    const run = DeliveryRun.create({
      runDate: b.runDate.slice(0, 10),
      routeId: b.routeId,
      vehicleInfo: b.vehicleInfo ?? undefined,
      driverSalespersonId: b.driverSalespersonId ?? undefined,
      status: b.status ?? 'draft',
      createdBy: req.auth?.userId,
      coldChainRequired: b.coldChainRequired ?? false,
      controlledDeliveryRequired: b.controlledDeliveryRequired ?? false,
      dispatchComplianceNote: b.dispatchComplianceNote ?? undefined,
      deliveryComplianceNote: b.deliveryComplianceNote ?? undefined,
    });
    await DeliveryRun.save(run);
    if (b.deliveryNoteIds?.length) {
      await replaceRunItems(run.id, b.deliveryNoteIds);
    }
    const full = await DeliveryRun.findOne({
      where: { id: run.id },
      relations: ['route'],
    });
    const items = await DeliveryRunItem.find({
      where: { deliveryRunId: run.id },
    });
    return created({
      data: serializeDeliveryRun(full!, {
        noteIds: items.map((i) => i.deliveryNoteId),
        routeCode: full?.route?.code,
        routeName: full?.route?.name,
      }),
    });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, { error: (e as Error).message });
  }
}

export async function updateDeliveryRun(req: Request, body: UpdateDeliveryRunInput): Promise<ControllerResult> {
  const b = body;
  try {
    const repo = DeliveryRun.getRepository();
    const row = await repo.findOne({ where: { id: req.params.id }, relations: ['route'] });
    if (!row) throw new HttpError(404, { error: 'Not found' });
    if (b.runDate !== undefined) row.runDate = b.runDate.slice(0, 10);
    if (b.routeId !== undefined) row.routeId = b.routeId;
    if (b.vehicleInfo !== undefined) row.vehicleInfo = b.vehicleInfo ?? undefined;
    if (b.driverSalespersonId !== undefined) row.driverSalespersonId = b.driverSalespersonId ?? undefined;
    if (b.status !== undefined) row.status = b.status;
    if (undefined !== undefined) undefined = undefined ?? undefined;
    if (b.coldChainRequired !== undefined) row.coldChainRequired = b.coldChainRequired;
    if (b.controlledDeliveryRequired !== undefined) row.controlledDeliveryRequired = b.controlledDeliveryRequired;
    if (b.dispatchComplianceNote !== undefined) row.dispatchComplianceNote = b.dispatchComplianceNote ?? undefined;
    if (b.deliveryComplianceNote !== undefined) row.deliveryComplianceNote = b.deliveryComplianceNote ?? undefined;
    await repo.save(row);
    if (b.deliveryNoteIds !== undefined) {
      await replaceRunItems(row.id, b.deliveryNoteIds);
    }
    const items = await DeliveryRunItem.find({
      where: { deliveryRunId: row.id },
    });
    const full = await repo.findOne({ where: { id: row.id }, relations: ['route'] });
    return ok({
      data: serializeDeliveryRun(full!, {
        noteIds: items.map((i) => i.deliveryNoteId),
        routeCode: full?.route?.code,
        routeName: full?.route?.name,
      }),
    });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, { error: (e as Error).message });
  }
}

export async function deleteDeliveryRun(req: Request): Promise<ControllerResult> {
  const row = await DeliveryRun.findOne({ where: { id: req.params.id } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (row.status !== 'draft' && row.status !== 'cancelled') {
    throw new HttpError(400, { error: 'Only draft or cancelled runs can be deleted' });
  }
  await DeliveryRunItem.delete({ deliveryRunId: row.id });
  await DeliveryRun.delete({ id: row.id });
  return ok({ data: { id: row.id, deleted: true } });
}
