import type { Request } from 'express';
import type { z } from 'zod';
import { Grn, GrnLine } from '@tradeflow/db';
import { createGrnSchema, listGrnsQuerySchema, updateGrnSchema } from '@tradeflow/shared';
import { getValidatedQuery } from '../../../shared/middleware/validate';
import { getPaginationFromQuery } from '../../../shared/utils/pagination';
import {
  loadLinkedInvoicesByGrnIds,
  settlementFields,
  type LinkedSupplierInvoice,
} from '../services/grnInvoiceSettlement';
import { created, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';
import {
  applyInvoiceSettlementFilter,
  createGrn as createGrnService,
  updateGrn as updateGrnService,
  postGrn as postGrnService,
  createSupplierInvoiceDraftFromGrn as createSupplierInvoiceDraftFromGrnService,
} from '../services/grnService';

type CreateGrnInput = z.infer<typeof createGrnSchema>;
type UpdateGrnInput = z.infer<typeof updateGrnSchema>;

function serializeGrn(g: Grn, lines?: GrnLine[], linked?: LinkedSupplierInvoice | null) {
  return {
    id: g.id,
    purchaseOrderId: g.purchaseOrderId ?? null,
    supplierId: g.supplierId,
    grnDate: g.grnDate,
    warehouseId: g.warehouseId,
    status: g.status,
    createdBy: g.createdBy ?? null,
    createdAt: g.createdAt,
    ...settlementFields(g.status, linked),
    supplier: g.supplier ? { id: g.supplier.id, name: g.supplier.name } : undefined,
    warehouse: g.warehouse ? { id: g.warehouse.id, name: g.warehouse.name } : undefined,
    lines:
      lines?.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        bonusQuantity: l.bonusQuantity ?? '0',
        unitPrice: l.unitPrice,
        tradePrice: l.tradePrice ?? null,
        retailPrice: l.retailPrice ?? null,
        purchaseOrderLineId: l.purchaseOrderLineId ?? null,
        batchCode: l.batchCode ?? null,
        expiryDate: l.expiryDate ? String(l.expiryDate).slice(0, 10) : null,
      })) ?? undefined,
  };
}

type ListGrnsQuery = z.infer<typeof listGrnsQuerySchema>;

export async function listGrns(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<ListGrnsQuery>(req);
  const { limit, offset } = getPaginationFromQuery(q);
  const qb = Grn.createQueryBuilder('g')
    .leftJoinAndSelect('g.supplier', 's')
    .leftJoinAndSelect('g.warehouse', 'w')
    .where('1=1');
  if (q.supplierId) qb.andWhere('g.supplierId = :sid', { sid: q.supplierId });
  if (q.status) qb.andWhere('g.status = :st', { st: q.status });
  if (q.invoiceSettlement) applyInvoiceSettlementFilter(qb, q.invoiceSettlement);
  qb.orderBy('g.grnDate', 'DESC').addOrderBy('g.createdAt', 'DESC').take(limit).skip(offset);
  const [rows, total] = await qb.getManyAndCount();
  const linkedMap = await loadLinkedInvoicesByGrnIds(rows.map((r) => r.id));
  return ok({
    data: rows.map((r) => serializeGrn(r, undefined, linkedMap.get(r.id))),
    meta: { total, limit, offset },
  });
}

export async function pendingInvoiceCount(_req: Request): Promise<ControllerResult> {
  const row = await Grn.createQueryBuilder('g')
    .select('COUNT(*)', 'count')
    .where(`g.status = 'posted'`)
    .andWhere(
      `(
        NOT EXISTS (SELECT 1 FROM supplier_invoices si WHERE si.grn_id = g.id)
        OR EXISTS (SELECT 1 FROM supplier_invoices si WHERE si.grn_id = g.id AND si.status = 'draft')
      )`
    )
    .getRawOne<{ count: string }>();
  return ok({ data: { count: Number(row?.count ?? 0) } });
}

export async function getGrn(req: Request): Promise<ControllerResult> {
  const g = await Grn.findOne({
    where: { id: req.params.id },
    relations: ['lines', 'supplier', 'warehouse'],
  });
  if (!g) {
    throw new HttpError(404, { error: 'Not found' });
  }
  const linkedMap = await loadLinkedInvoicesByGrnIds([g.id]);
  return ok({ data: serializeGrn(g, g.lines, linkedMap.get(g.id)) });
}

export async function createSupplierInvoiceDraftFromGrn(req: Request): Promise<ControllerResult> {
  const result = await createSupplierInvoiceDraftFromGrnService(req.params.id, req.auth?.userId);
  return created({ data: result });
}

export async function createGrn(req: Request, body: CreateGrnInput): Promise<ControllerResult> {
  const row = await createGrnService(body, req.auth?.userId);
  const linkedMap = await loadLinkedInvoicesByGrnIds([row.id]);
  return created({ data: serializeGrn(row, row.lines, linkedMap.get(row.id)) });
}

export async function updateGrn(req: Request, body: UpdateGrnInput): Promise<ControllerResult> {
  const row = await updateGrnService(req.params.id, body);
  const linkedMap = await loadLinkedInvoicesByGrnIds([row.id]);
  return ok({ data: serializeGrn(row, row.lines, linkedMap.get(row.id)) });
}

export async function postGrn(req: Request): Promise<ControllerResult> {
  const row = await postGrnService(req.params.id, req.auth?.userId);
  const linkedMap = await loadLinkedInvoicesByGrnIds([row.id]);
  return ok({ data: serializeGrn(row, row.lines, linkedMap.get(row.id)) });
}
