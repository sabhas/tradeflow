import { Router } from 'express';
import {
  dataSource,
  Grn,
  GrnLine,
  PurchaseOrder,
  PurchaseOrderLine,
} from '@tradeflow/db';
import { createGrnSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';
import {
  applyMovement,
  assertProductInScope,
  assertWarehouseInScope,
  runInTransaction,
} from '../services/inventoryService';
import { parseDecimalStrict } from '../utils/decimal';
import { assertDateNotPeriodLocked } from '../services/periodLock';

export const grnsRouter = Router();
grnsRouter.use(authMiddleware, loadUser);

function serialize(g: Grn, lines?: GrnLine[]) {
  return {
    id: g.id,
    purchaseOrderId: g.purchaseOrderId ?? null,
    supplierId: g.supplierId,
    grnDate: g.grnDate,
    warehouseId: g.warehouseId,
    status: g.status,
    branchId: g.branchId ?? null,
    createdBy: g.createdBy ?? null,
    createdAt: g.createdAt,
    supplier: g.supplier ? { id: g.supplier.id, name: g.supplier.name } : undefined,
    warehouse: g.warehouse ? { id: g.warehouse.id, name: g.warehouse.name } : undefined,
    lines:
      lines?.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        purchaseOrderLineId: l.purchaseOrderLineId ?? null,
        batchCode: l.batchCode ?? null,
        expiryDate: l.expiryDate ? String(l.expiryDate).slice(0, 10) : null,
      })) ?? undefined,
  };
}

grnsRouter.get('/', requirePermission('purchases.grn', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const { limit, offset } = getPagination(req);
  const qb = dataSource
    .getRepository(Grn)
    .createQueryBuilder('g')
    .leftJoinAndSelect('g.supplier', 's')
    .leftJoinAndSelect('g.warehouse', 'w')
    .where('1=1');
  if (branchId) qb.andWhere('(g.branch_id IS NULL OR g.branch_id = :bid)', { bid: branchId });
  if (req.query.supplierId) qb.andWhere('g.supplier_id = :sid', { sid: req.query.supplierId });
  if (req.query.status) qb.andWhere('g.status = :st', { st: req.query.status });
  qb.orderBy('g.grn_date', 'DESC').addOrderBy('g.created_at', 'DESC').take(limit).skip(offset);
  const [rows, total] = await qb.getManyAndCount();
  res.json({ data: rows.map((r) => serialize(r)), meta: { total, limit, offset } });
});

grnsRouter.get('/:id', requirePermission('purchases.grn', 'read'), async (req, res) => {
  const g = await dataSource.getRepository(Grn).findOne({
    where: { id: req.params.id },
    relations: ['lines', 'supplier', 'warehouse'],
  });
  if (!g) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ data: serialize(g, g.lines) });
});

grnsRouter.post(
  '/',
  requirePermission('purchases.grn', 'write'),
  auditMiddleware({ entity: 'Grn', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createGrnSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const branchId = b.branchId ?? req.user?.branchId ?? undefined;
    const userId = req.auth?.userId;
    try {
      await assertWarehouseInScope(b.warehouseId, branchId);
      for (const line of b.lines) {
        await assertProductInScope(line.productId, branchId);
      }
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Bad request' });
      return;
    }

    try {
      const row = await runInTransaction(async (manager) => {
        let purchaseOrderId: string | undefined = b.purchaseOrderId ?? undefined;
        if (purchaseOrderId) {
          const po = await manager.findOne(PurchaseOrder, {
            where: { id: purchaseOrderId },
            relations: ['lines'],
          });
          if (!po) throw new Error('Purchase order not found');
          if (po.supplierId !== b.supplierId) throw new Error('Supplier must match purchase order');
          if (po.warehouseId !== b.warehouseId) throw new Error('Warehouse must match purchase order');
          for (const ln of b.lines) {
            if (!ln.purchaseOrderLineId) continue;
            const pol = po.lines?.find((p) => p.id === ln.purchaseOrderLineId);
            if (!pol) throw new Error('Invalid purchase order line');
            if (pol.productId !== ln.productId) throw new Error('Product does not match PO line');
            const rem = parseFloat(pol.quantity) - parseFloat(pol.receivedQuantity);
            const q = parseFloat(String(ln.quantity));
            if (q > rem + 0.0001) throw new Error('Receive quantity exceeds open PO quantity');
          }
        }

        const grn = manager.create(Grn, {
          purchaseOrderId: purchaseOrderId ?? undefined,
          supplierId: b.supplierId,
          grnDate: b.grnDate.slice(0, 10),
          warehouseId: b.warehouseId,
          status: 'draft',
          branchId: branchId ?? undefined,
          createdBy: userId,
        });
        await manager.save(grn);

        for (const ln of b.lines) {
          let unitPriceStr = '0.0000';
          if (ln.purchaseOrderLineId) {
            const pol = await manager.findOne(PurchaseOrderLine, { where: { id: ln.purchaseOrderLineId } });
            if (!pol) throw new Error('Purchase order line not found');
            unitPriceStr = pol.unitPrice;
          }
          if (ln.unitPrice != null && ln.unitPrice !== '') unitPriceStr = String(ln.unitPrice);
          await manager.save(
            manager.create(GrnLine, {
              grnId: grn.id,
              productId: ln.productId,
              quantity: parseDecimalStrict(String(ln.quantity)),
              unitPrice: parseDecimalStrict(unitPriceStr),
              purchaseOrderLineId: ln.purchaseOrderLineId ?? undefined,
              batchCode: ln.batchCode?.trim() || undefined,
              expiryDate: ln.expiryDate?.trim() ? ln.expiryDate.slice(0, 10) : undefined,
            })
          );
        }

        return manager.findOneOrFail(Grn, {
          where: { id: grn.id },
          relations: ['lines', 'supplier', 'warehouse'],
        });
      });
      res.status(201).json({ data: serialize(row, row.lines) });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Failed to create GRN' });
    }
  }
);

grnsRouter.post(
  '/:id/post',
  requirePermission('purchases.grn', 'post'),
  auditMiddleware({
    entity: 'Grn',
    getEntityId: (req) => req.params.id,
    getNewValue: () => ({ status: 'posted' }),
  }),
  async (req, res) => {
    try {
      const row = await runInTransaction(async (manager) => {
        const grn = await manager.findOne(Grn, {
          where: { id: req.params.id },
          relations: ['lines'],
        });
        if (!grn) throw new Error('Not found');
        if (grn.status !== 'draft') throw new Error('Only draft GRNs can be posted');
        await assertDateNotPeriodLocked(manager, grn.grnDate);

        for (const line of grn.lines ?? []) {
          await assertProductInScope(line.productId, grn.branchId ?? undefined);
          await assertWarehouseInScope(grn.warehouseId, grn.branchId ?? undefined);
          const qty = parseDecimalStrict(line.quantity);
          await applyMovement(manager, {
            productId: line.productId,
            warehouseId: grn.warehouseId,
            quantityDelta: qty,
            refType: 'purchase',
            refId: grn.id,
            unitCost: line.unitPrice,
            movementDate: grn.grnDate,
            branchId: grn.branchId ?? undefined,
            userId: req.auth?.userId,
            grnLineId: line.id,
            batchCode: line.batchCode,
            expiryDate: line.expiryDate ? String(line.expiryDate).slice(0, 10) : undefined,
          });

          if (line.purchaseOrderLineId) {
            const pol = await manager.findOne(PurchaseOrderLine, { where: { id: line.purchaseOrderLineId } });
            if (pol) {
              const newRec = (parseFloat(pol.receivedQuantity) + parseFloat(qty)).toFixed(4);
              pol.receivedQuantity = newRec;
              await manager.save(pol);
            }
          }
        }

        grn.status = 'posted';
        await manager.save(grn);

        if (grn.purchaseOrderId) {
          const po = await manager.findOne(PurchaseOrder, {
            where: { id: grn.purchaseOrderId },
            relations: ['lines'],
          });
          if (po?.lines?.length) {
            const allReceived = po.lines.every(
              (l) => parseFloat(l.receivedQuantity) + 0.0001 >= parseFloat(l.quantity)
            );
            if (allReceived) {
              po.status = 'closed';
              await manager.save(po);
            }
          }
        }

        return manager.findOneOrFail(Grn, {
          where: { id: grn.id },
          relations: ['lines', 'supplier', 'warehouse'],
        });
      });
      res.json({ data: serialize(row, row.lines) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Post failed';
      if (msg === 'Not found') res.status(404).json({ error: msg });
      else res.status(400).json({ error: msg });
    }
  }
);
