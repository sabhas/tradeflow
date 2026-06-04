import type { Request } from 'express';
import type { z } from 'zod';
import { SupplierInvoice, type SupplierInvoiceLine } from '@tradeflow/db';
import { createSupplierInvoiceSchema, updateSupplierInvoiceSchema } from '@tradeflow/shared';
import { getPagination } from '../../../shared/utils/pagination';
import { created, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';
import {
  createSupplierInvoice as createSupplierInvoiceService,
  listOpenSupplierInvoices as listOpenSupplierInvoicesService,
  postSupplierInvoice as postSupplierInvoiceService,
  updateSupplierInvoice as updateSupplierInvoiceService,
} from '../services/supplierInvoiceService';

type CreateSupplierInvoiceInput = z.infer<typeof createSupplierInvoiceSchema>;
type UpdateSupplierInvoiceInput = z.infer<typeof updateSupplierInvoiceSchema>;

function serialize(inv: SupplierInvoice, lines?: SupplierInvoiceLine[]) {
  return {
    id: inv.id,
    supplierId: inv.supplierId,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    purchaseOrderId: inv.purchaseOrderId ?? null,
    grnId: inv.grnId ?? null,
    status: inv.status,
    subtotal: inv.subtotal,
    taxAmount: inv.taxAmount,
    discountAmount: inv.discountAmount,
    total: inv.total,
    notes: inv.notes ?? null,
    createdBy: inv.createdBy ?? null,
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
    supplier: inv.supplier ? { id: inv.supplier.id, name: inv.supplier.name } : undefined,
    lines:
      lines?.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        bonusQuantity: l.bonusQuantity ?? '0',
        unitPrice: l.unitPrice,
        taxAmount: l.taxAmount,
        discountAmount: l.discountAmount,
        grnLineId: l.grnLineId ?? null,
        taxProfileId: l.taxProfileId ?? null,
      })) ?? undefined,
  };
}

export async function listSupplierInvoices(req: Request): Promise<ControllerResult> {
  const { limit, offset } = getPagination(req);
  const qb = SupplierInvoice.createQueryBuilder('si').leftJoinAndSelect('si.supplier', 's').where('1=1');
  if (req.query.supplierId) qb.andWhere('si.supplierId = :sid', { sid: req.query.supplierId });
  if (req.query.status) qb.andWhere('si.status = :st', { st: req.query.status });
  qb.orderBy('si.invoiceDate', 'DESC').addOrderBy('si.createdAt', 'DESC').take(limit).skip(offset);
  const [rows, total] = await qb.getManyAndCount();
  return ok({ data: rows.map((r) => serialize(r)), meta: { total, limit, offset } });
}

export async function listOpenSupplierInvoices(req: Request): Promise<ControllerResult> {
  const supplierId = req.query.supplierId as string | undefined;
  const paymentDate = (
    (req.query.paymentDate as string | undefined) ?? new Date().toISOString().slice(0, 10)
  ).slice(0, 10);
  const paymentMethod = ((req.query.paymentMethod as string | undefined) ?? 'bank').trim() || 'bank';
  if (!supplierId) {
    throw new HttpError(400, { error: 'supplierId required' });
  }
  const { rows, availableDebitAmount, availableLiquidAmount, asOfDate } =
    await listOpenSupplierInvoicesService(supplierId, paymentDate, paymentMethod);
  return ok({ data: rows, meta: { availableDebitAmount, availableLiquidAmount, asOfDate } });
}

export async function getSupplierInvoice(req: Request): Promise<ControllerResult> {
  const inv = await SupplierInvoice.findOne({
    where: { id: req.params.id },
    relations: ['lines', 'supplier'],
  });
  if (!inv) {
    throw new HttpError(404, { error: 'Not found' });
  }
  return ok({ data: serialize(inv, inv.lines) });
}

export async function createSupplierInvoice(
  req: Request,
  body: CreateSupplierInvoiceInput
): Promise<ControllerResult> {
  const row = await createSupplierInvoiceService(body, req.auth?.userId);
  return created({ data: serialize(row, row.lines) });
}

export async function updateSupplierInvoice(
  req: Request,
  body: UpdateSupplierInvoiceInput
): Promise<ControllerResult> {
  const row = await updateSupplierInvoiceService(req.params.id, body);
  return ok({ data: serialize(row, row.lines) });
}

export async function postSupplierInvoice(req: Request): Promise<ControllerResult> {
  await postSupplierInvoiceService(req.params.id, req.auth?.userId);
  const inv = await SupplierInvoice.findOne({
    where: { id: req.params.id },
    relations: ['lines', 'supplier'],
  });
  return ok({ data: serialize(inv!, inv!.lines) });
}

export async function deleteSupplierInvoice(req: Request): Promise<ControllerResult> {
  const repo = SupplierInvoice.getRepository();
  const inv = await repo.findOne({ where: { id: req.params.id } });
  if (!inv) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (inv.status !== 'draft') {
    throw new HttpError(400, { error: 'Only draft supplier invoices can be deleted' });
  }
  await repo.remove(inv);
  return ok({ data: { id: req.params.id, deleted: true } });
}
