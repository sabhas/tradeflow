import type { EntityManager } from 'typeorm';
import { In } from 'typeorm';
import { Product, StockBalance } from '@tradeflow/db';
import { HttpError } from '../utils/httpError';

const EPS = 1e-6;

/**
 * Ensures each product line (aggregated by product) has enough on-hand quantity in the given warehouse.
 * Used for draft sales orders; requires a warehouse so stock is well-defined.
 */
export async function assertSalesOrderLinesInStock(
  manager: EntityManager,
  warehouseId: string | null | undefined,
  lines: Array<{ productId: string; quantity: number }>
): Promise<void> {
  if (!warehouseId) {
    throw new HttpError(400, {
      error:
        'Select a default warehouse before saving. Stock availability is checked for that warehouse.',
    });
  }

  const byProduct = new Map<string, number>();
  for (const l of lines) {
    if (!l.productId || !(l.quantity > 0)) continue;
    byProduct.set(l.productId, (byProduct.get(l.productId) ?? 0) + l.quantity);
  }

  const productIds = [...byProduct.keys()];
  if (productIds.length === 0) return;

  const products = await manager.find(Product, { where: { id: In(productIds) } });
  const skuById = new Map(products.map((p) => [p.id, p.sku]));

  const balances = await manager.find(StockBalance, {
    where: { warehouseId, productId: In(productIds) },
  });
  const onHandByProduct = new Map<string, number>();
  for (const b of balances) {
    onHandByProduct.set(b.productId, parseFloat(b.quantity));
  }

  for (const [productId, need] of byProduct) {
    const onHand = onHandByProduct.get(productId) ?? 0;
    if (onHand + EPS < need) {
      const sku = skuById.get(productId) ?? productId;
      throw new HttpError(400, {
        error: `Insufficient stock for ${sku}: ordered ${need}, available ${onHand.toFixed(4)}`,
      });
    }
  }
}
