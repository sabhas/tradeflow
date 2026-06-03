import { EntityManager, In, IsNull } from 'typeorm';
import { Product } from '@tradeflow/db';
import { parseDecimalStrict } from '../../../shared/utils/decimal';
import { loadCompanyForInventory, planLayerConsumptions } from '../../inventory/services/stockLayerService';

export interface InvoiceLinePricingInput {
  productId: string;
  quantity: number;
  unitPrice?: string;
  discountAmount?: string;
  taxProfileId?: string | null;
  originalInvoiceLineId?: string | null;
}

export interface InvoiceLinePricingResolved extends InvoiceLinePricingInput {
  unitPrice: string;
}

export function pickLayerPrice(
  product: Product,
  lineUsesRetail: boolean,
  trade?: string,
  retail?: string
): string {
  if (lineUsesRetail) {
    return parseDecimalStrict(retail ?? product.retailPrice ?? product.sellingPrice ?? '0');
  }
  return parseDecimalStrict(trade ?? product.sellingPrice ?? '0');
}

function weightedLayerPrice(
  totalQty: number,
  parts: Array<{ quantity: string; tradePrice?: string; retailPrice?: string }>,
  product: Product
): string {
  const useRetail = product.autoPriceFromRetail === true;
  const qty = totalQty;
  if (qty <= 0) throw new Error('Line quantity must be positive');
  let weighted = 0;
  for (const part of parts) {
    const q = parseFloat(parseDecimalStrict(part.quantity));
    const p = parseFloat(pickLayerPrice(product, useRetail, part.tradePrice, part.retailPrice));
    weighted += q * p;
  }
  return parseDecimalStrict((weighted / qty).toFixed(4));
}

/** Resolve missing invoice unit prices from layer-level trade/retail batch prices. */
export async function resolveInvoiceLineUnitPrices(
  manager: EntityManager,
  warehouseId: string,
  lines: InvoiceLinePricingInput[]
): Promise<InvoiceLinePricingResolved[]> {
  const productIds = [...new Set(lines.map((line) => line.productId))];
  const products = await manager.find(Product, {
    where: { id: In(productIds), deletedAt: IsNull() },
  });
  const productById = new Map(products.map((p) => [p.id, p]));
  const company = await loadCompanyForInventory(manager);

  const resolved: InvoiceLinePricingResolved[] = [];
  for (const line of lines) {
    const provided = line.unitPrice?.trim();
    if (provided) {
      resolved.push({ ...line, unitPrice: parseDecimalStrict(provided) });
      continue;
    }
    const product = productById.get(line.productId);
    if (!product) throw new Error(`Product not found: ${line.productId}`);
    const parts = await planLayerConsumptions(manager, product, company, warehouseId, String(line.quantity));
    resolved.push({
      ...line,
      unitPrice: weightedLayerPrice(line.quantity, parts, product),
    });
  }
  return resolved;
}
