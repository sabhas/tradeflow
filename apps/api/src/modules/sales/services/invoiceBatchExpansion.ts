import { EntityManager, In } from 'typeorm';
import { Invoice, InvoiceLine, Product } from '@tradeflow/db';
import { parseDecimalStrict } from '../../../shared/utils/decimal';
import { toIsoDateString } from '../../../shared/utils/date';
import { computeSalesDocumentTotals } from './salesTotals';
import { pickLayerPrice } from './invoicePricingService';
import {
  loadCompanyForInventory,
  planLayerConsumptions,
  type LayerConsumption,
} from '../../inventory/services/stockLayerService';

export type ExpandedLinePlan = {
  line: InvoiceLine;
  plannedConsumptions?: LayerConsumption[];
};

function productNeedsBatchSplit(product: Product): boolean {
  return product.batchTracked || product.expiryTracked;
}

function splitLineDiscount(
  totalDisc: number,
  partQty: number,
  totalQty: number,
  isLast: boolean,
  assigned: number
): number {
  if (totalDisc <= 0) return 0;
  if (isLast) return Math.max(0, totalDisc - assigned);
  return (partQty / totalQty) * totalDisc;
}

function lineStockOutQty(line: InvoiceLine): number {
  return parseFloat(line.quantity) + parseFloat(line.bonusQuantity || '0');
}

function sliceConsumptions(
  parts: LayerConsumption[],
  paidQty: number,
  bonusQty: number
): { paidParts: LayerConsumption[]; bonusParts: LayerConsumption[] } {
  const paidParts: LayerConsumption[] = [];
  const bonusParts: LayerConsumption[] = [];
  let paidLeft = paidQty;
  let bonusLeft = bonusQty;

  for (const part of parts) {
    let remaining = parseFloat(part.quantity);
    while (remaining > 1e-6 && paidLeft > 1e-6) {
      const take = Math.min(remaining, paidLeft);
      paidParts.push({ ...part, quantity: parseDecimalStrict(take.toFixed(4)) });
      paidLeft -= take;
      remaining -= take;
    }
    while (remaining > 1e-6 && bonusLeft > 1e-6) {
      const take = Math.min(remaining, bonusLeft);
      bonusParts.push({ ...part, quantity: parseDecimalStrict(take.toFixed(4)) });
      bonusLeft -= take;
      remaining -= take;
    }
  }

  return { paidParts, bonusParts };
}

/**
 * Before posting a sales invoice: split batch-tracked draft lines into one row per batch (FEFO/FIFO),
 * recompute document totals, and return per-line planned layer consumptions for stock posting.
 */
export async function expandBatchTrackedInvoiceLinesForPost(
  manager: EntityManager,
  invoice: Invoice
): Promise<{ plans: ExpandedLinePlan[]; salesOrderDelivered: Map<string, string> }> {
  const lines = await manager.find(InvoiceLine, {
    where: { invoiceId: invoice.id },
    order: { id: 'ASC' },
  });
  if (!lines.length) {
    return { plans: [], salesOrderDelivered: new Map() };
  }

  const productIds = [...new Set(lines.map((l) => l.productId))];
  const products = await manager.find(Product, { where: { id: In(productIds) } });
  const productById = new Map(products.map((p) => [p.id, p]));
  const company = await loadCompanyForInventory(manager);

  type DraftLine = {
    productId: string;
    quantity: number;
    bonusQuantity: string;
    unitPrice: string;
    discountAmount: string;
    taxProfileId?: string | null;
    salesOrderLineId?: string;
    batchCode?: string;
    expiryDate?: string;
    planned?: LayerConsumption[];
  };

  const expanded: DraftLine[] = [];
  const salesOrderDelivered = new Map<string, number>();

  for (const line of lines) {
    const product = productById.get(line.productId);
    if (!product) throw new Error(`Product not found: ${line.productId}`);
    const qty = parseFloat(line.quantity);
    const bonusQty = parseFloat(line.bonusQuantity || '0');
    if (qty <= 0) throw new Error('Line quantity must be positive');

    if (!productNeedsBatchSplit(product)) {
      expanded.push({
        productId: line.productId,
        quantity: qty,
        bonusQuantity: line.bonusQuantity || '0',
        unitPrice: line.unitPrice,
        discountAmount: line.discountAmount,
        taxProfileId: line.taxProfileId,
        salesOrderLineId: line.salesOrderLineId,
      });
      if (line.salesOrderLineId) {
        salesOrderDelivered.set(
          line.salesOrderLineId,
          (salesOrderDelivered.get(line.salesOrderLineId) ?? 0) + qty
        );
      }
      continue;
    }

    if (line.batchCode?.trim()) {
      expanded.push({
        productId: line.productId,
        quantity: qty,
        bonusQuantity: line.bonusQuantity || '0',
        unitPrice: line.unitPrice,
        discountAmount: line.discountAmount,
        taxProfileId: line.taxProfileId,
        salesOrderLineId: line.salesOrderLineId,
        batchCode: line.batchCode?.trim(),
        expiryDate: toIsoDateString(line.expiryDate),
      });
      if (line.salesOrderLineId) {
        salesOrderDelivered.set(
          line.salesOrderLineId,
          (salesOrderDelivered.get(line.salesOrderLineId) ?? 0) + qty
        );
      }
      continue;
    }

    const allParts = await planLayerConsumptions(
      manager,
      product,
      company,
      invoice.warehouseId,
      String(qty + bonusQty)
    );
    const { paidParts, bonusParts } = sliceConsumptions(allParts, qty, bonusQty);
    const totalDisc = parseFloat(line.discountAmount || '0');
    let discAssigned = 0;
    const useRetail = product.autoPriceFromRetail === true;

    for (let i = 0; i < paidParts.length; i++) {
      const part = paidParts[i];
      const partQty = parseFloat(part.quantity);
      const partDisc = splitLineDiscount(totalDisc, partQty, qty, i === paidParts.length - 1, discAssigned);
      discAssigned += partDisc;
      const unitPrice = pickLayerPrice(product, useRetail, part.tradePrice, part.retailPrice);
      const planned: LayerConsumption[] =
        i === 0 ? [...(bonusParts.length ? [part, ...bonusParts] : [part])] : [part];

      expanded.push({
        productId: line.productId,
        quantity: partQty,
        bonusQuantity: i === 0 ? parseDecimalStrict(String(bonusQty)) : '0.0000',
        unitPrice,
        discountAmount: partDisc.toFixed(4),
        taxProfileId: line.taxProfileId,
        salesOrderLineId: i === 0 ? line.salesOrderLineId : undefined,
        batchCode: part.batchCode?.trim() || undefined,
        expiryDate: toIsoDateString(part.expiryDate),
        planned,
      });
    }

    if (line.salesOrderLineId) {
      salesOrderDelivered.set(
        line.salesOrderLineId,
        (salesOrderDelivered.get(line.salesOrderLineId) ?? 0) + qty
      );
    }
  }

  const totals = await computeSalesDocumentTotals(
    manager,
    invoice.customerId,
    expanded.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      bonusQuantity: l.bonusQuantity,
      unitPrice: l.unitPrice,
      discountAmount: l.discountAmount,
      taxProfileId: l.taxProfileId,
    })),
    invoice.discountAmount
  );

  invoice.subtotal = totals.subtotal;
  invoice.taxAmount = totals.taxAmount;
  invoice.discountAmount = totals.discountAmount;
  invoice.total = totals.total;
  await manager.save(invoice);

  await manager.delete(InvoiceLine, { invoiceId: invoice.id });

  const plans: ExpandedLinePlan[] = [];
  for (let i = 0; i < totals.lines.length; i++) {
    const tl = totals.lines[i];
    const src = expanded[i];
    const saved = await manager.save(
      manager.create(InvoiceLine, {
        invoiceId: invoice.id,
        productId: tl.productId,
        quantity: tl.quantity,
        bonusQuantity: src.bonusQuantity,
        unitPrice: tl.unitPrice,
        taxAmount: tl.taxAmount,
        discountAmount: tl.discountAmount,
        taxProfileId: tl.taxProfileId ?? undefined,
        salesOrderLineId: src.salesOrderLineId,
        batchCode: src.batchCode,
        expiryDate: toIsoDateString(src.expiryDate),
      })
    );
    plans.push({
      line: saved,
      plannedConsumptions: src.planned,
    });
  }

  const soDeliveredOut = new Map<string, string>();
  for (const [solId, q] of salesOrderDelivered) {
    soDeliveredOut.set(solId, q.toFixed(4));
  }

  return { plans, salesOrderDelivered: soDeliveredOut };
}

/** Resolve layer consumption for an already-split invoice line (batch known). */
export async function planConsumptionForInvoiceLine(
  manager: EntityManager,
  product: Product,
  warehouseId: string,
  line: InvoiceLine
): Promise<LayerConsumption[]> {
  const company = await loadCompanyForInventory(manager);
  const stockQty = lineStockOutQty(line);
  const parts = await planLayerConsumptions(
    manager,
    product,
    company,
    warehouseId,
    parseDecimalStrict(stockQty.toFixed(4))
  );
  const batchNorm = (line.batchCode ?? '').trim();
  const expiryNorm = toIsoDateString(line.expiryDate) ?? '';

  const match = parts.filter(
    (p) => (p.batchCode ?? '').trim() === batchNorm && (p.expiryDate ?? '') === expiryNorm
  );

  if (match.length === 1) return match;

  const qtyNeed = stockQty;
  let got = 0;
  const out: LayerConsumption[] = [];
  for (const p of match) {
    out.push(p);
    got += parseFloat(p.quantity);
    if (got >= qtyNeed - 1e-6) return out;
  }

  if (match.length === 0) {
    throw new Error('Batch on invoice line no longer matches available stock layers');
  }
  return match;
}
