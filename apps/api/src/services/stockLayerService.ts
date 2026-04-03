import { EntityManager } from 'typeorm';
import {
  CompanySettings,
  InventoryLayerConsumption,
  Product,
  StockLayer,
} from '@tradeflow/db';
import { decimalCmp, decimalSub, parseDecimalStrict } from '../utils/decimal';
import { getCompanySettingsRow } from './companySettings';

export type CostingMode = 'fefo' | 'fifo' | 'lifo';

export function resolveCostingMode(product: Product, company: CompanySettings): CostingMode {
  if (product.expiryTracked) return 'fefo';
  const o = product.costingMethod?.toLowerCase();
  if (o === 'lifo') return 'lifo';
  if (o === 'fifo') return 'fifo';
  const c = company.inventoryCostingMethod?.toLowerCase();
  return c === 'lifo' ? 'lifo' : 'fifo';
}

export interface LayerConsumption {
  stockLayerId: string;
  quantity: string;
  unitCost: string;
  batchCode?: string;
  expiryDate?: string;
}

function layerOrderClause(mode: CostingMode): string {
  if (mode === 'fefo') return 'l.expiry_date ASC NULLS LAST, l.received_at ASC';
  if (mode === 'lifo') return 'l.received_at DESC';
  return 'l.received_at ASC';
}

/** Consume quantity from stock layers; returns weighted average unit cost for the movement line. */
export async function consumeFromLayers(
  manager: EntityManager,
  product: Product,
  company: CompanySettings,
  warehouseId: string,
  quantityToTake: string
): Promise<{ avgUnitCost: string; consumptions: LayerConsumption[] }> {
  const qtyNeed = parseDecimalStrict(quantityToTake);
  if (parseFloat(qtyNeed) <= 0) throw new Error('Quantity to consume must be positive');

  const mode = resolveCostingMode(product, company);
  const order = layerOrderClause(mode);

  const layers = await manager.query(
    `
    SELECT l.id, l.quantity_remaining, l.unit_cost, l.batch_code, l.expiry_date
    FROM stock_layers l
    WHERE l.product_id = $1 AND l.warehouse_id = $2
      AND l.quantity_remaining::numeric > 0.00001
    ORDER BY ${order}
    FOR UPDATE OF l
    `,
    [product.id, warehouseId]
  );

  let remaining = qtyNeed;
  const consumptions: LayerConsumption[] = [];
  let totalCogs = 0;

  for (const row of layers) {
    if (decimalCmp(remaining, '0.0000') <= 0) break;
    const layerId = row.id as string;
    const layerRem = parseDecimalStrict(String(row.quantity_remaining));
    const uc = parseDecimalStrict(String(row.unit_cost));
    const take =
      decimalCmp(layerRem, remaining) <= 0 ? layerRem : parseDecimalStrict(remaining);
    const takeNum = parseFloat(take);
    const cogs = takeNum * parseFloat(uc);
    totalCogs += cogs;

    consumptions.push({
      stockLayerId: layerId,
      quantity: take,
      unitCost: uc,
      batchCode: row.batch_code ?? undefined,
      expiryDate: row.expiry_date ? String(row.expiry_date).slice(0, 10) : undefined,
    });

    const newRem = decimalSub(layerRem, take);
    await manager.query(`UPDATE stock_layers SET quantity_remaining = $1::numeric WHERE id = $2`, [
      newRem,
      layerId,
    ]);
    remaining = decimalSub(remaining, take);
  }

  if (decimalCmp(remaining, '0.0000') > 0) {
    throw new Error('Insufficient stock: not enough layers to fulfill quantity');
  }

  const avg =
    parseFloat(qtyNeed) > 1e-9 ? (totalCogs / parseFloat(qtyNeed)).toFixed(4) : '0.0000';
  return { avgUnitCost: parseDecimalStrict(avg), consumptions };
}

export async function insertLayerConsumptions(
  manager: EntityManager,
  inventoryMovementId: string,
  consumptions: LayerConsumption[]
): Promise<void> {
  for (const c of consumptions) {
    await manager.insert(InventoryLayerConsumption, {
      inventoryMovementId,
      stockLayerId: c.stockLayerId,
      quantity: c.quantity,
      unitCost: c.unitCost,
    });
  }
}

export interface AddLayerParams {
  productId: string;
  warehouseId: string;
  quantity: string;
  unitCost: string;
  sourceRefType: string;
  sourceRefId?: string;
  grnLineId?: string;
  branchId?: string;
  batchCode?: string;
  expiryDate?: string;
  receivedAt?: Date;
}

export async function addInboundLayer(
  manager: EntityManager,
  params: AddLayerParams
): Promise<StockLayer> {
  const qty = parseDecimalStrict(params.quantity);
  const uc = parseDecimalStrict(params.unitCost);
  if (parseFloat(qty) <= 0) throw new Error('Inbound layer quantity must be positive');

  const layer = manager.create(StockLayer, {
    productId: params.productId,
    warehouseId: params.warehouseId,
    quantityRemaining: qty,
    unitCost: uc,
    batchCode: params.batchCode,
    expiryDate: params.expiryDate,
    receivedAt: params.receivedAt ?? new Date(),
    sourceRefType: params.sourceRefType,
    sourceRefId: params.sourceRefId,
    grnLineId: params.grnLineId,
    branchId: params.branchId,
  });
  return manager.save(layer);
}

export async function loadCompanyForInventory(manager: EntityManager): Promise<CompanySettings> {
  return getCompanySettingsRow(manager);
}
