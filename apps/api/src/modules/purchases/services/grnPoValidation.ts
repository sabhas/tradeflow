import type { EntityManager } from 'typeorm';
import { PurchaseOrder, PurchaseOrderLine } from '@tradeflow/db';

export interface GrnLinePoInput {
  productId: string;
  quantity: number | string;
  purchaseOrderLineId?: string | null;
}

export async function validateGrnAgainstPurchaseOrder(
  manager: EntityManager,
  options: {
    purchaseOrderId: string;
    supplierId: string;
    warehouseId: string;
    lines: GrnLinePoInput[];
  }
): Promise<void> {
  const { purchaseOrderId, supplierId, warehouseId, lines } = options;
  const po = await manager.findOne(PurchaseOrder, {
    where: { id: purchaseOrderId },
    relations: ['lines'],
  });
  if (!po) throw new Error('Purchase order not found');
  if (po.supplierId !== supplierId) throw new Error('Supplier must match purchase order');
  if (po.warehouseId !== warehouseId) throw new Error('Warehouse must match purchase order');

  const poLineById = new Map((po.lines ?? []).map((l) => [l.id, l]));

  for (const ln of lines) {
    if (!ln.purchaseOrderLineId) continue;
    const pol = poLineById.get(ln.purchaseOrderLineId);
    if (!pol) throw new Error('Invalid purchase order line');
    if (pol.productId !== ln.productId) throw new Error('Product does not match PO line');
    const q = Number(ln.quantity);
    const received = Number(pol.receivedQuantity ?? 0);
    const ordered = Number(pol.quantity);
    const rem = ordered - received;
    if (q > rem + 0.0001) throw new Error('Receive quantity exceeds open PO quantity');
  }
}

export async function linkGrnLinesToPoLines(
  manager: EntityManager,
  purchaseOrderId: string,
  lines: Array<{ purchaseOrderLineId?: string | null; productId: string }>
): Promise<void> {
  const poLines = await manager.find(PurchaseOrderLine, { where: { purchaseOrderId } });
  const byProduct = new Map(poLines.map((l) => [l.productId, l]));

  for (const ln of lines) {
    if (ln.purchaseOrderLineId) continue;
    const pol = byProduct.get(ln.productId);
    if (!pol) throw new Error('Purchase order line not found');
    ln.purchaseOrderLineId = pol.id;
  }
}
