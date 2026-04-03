import { EntityManager, IsNull } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  dataSource,
  InventoryMovement,
  InventoryRefType,
  Product,
  StockBalance,
  Warehouse,
} from '@tradeflow/db';
import { decimalAdd, decimalIsNegative, parseDecimalStrict } from '../utils/decimal';

function validateDeltaForRefType(refType: InventoryRefType, deltaNum: number): void {
  if (Math.abs(deltaNum) < 1e-12) {
    throw new Error('Quantity delta must be non-zero');
  }
  switch (refType) {
    case 'opening_balance':
    case 'purchase':
    case 'transfer_in':
      if (deltaNum <= 0) {
        throw new Error(`refType ${refType} requires a positive quantity delta`);
      }
      break;
    case 'sale':
    case 'transfer_out':
      if (deltaNum >= 0) {
        throw new Error(`refType ${refType} requires a negative quantity delta`);
      }
      break;
    case 'adjustment':
      break;
    default:
      throw new Error(`Unsupported refType: ${refType}`);
  }
}

async function getOrCreateBalanceLocked(
  manager: EntityManager,
  productId: string,
  warehouseId: string
): Promise<StockBalance> {
  let balance = await manager.findOne(StockBalance, {
    where: { productId, warehouseId },
    lock: { mode: 'pessimistic_write' },
  });
  if (!balance) {
    const created = manager.create(StockBalance, {
      productId,
      warehouseId,
      quantity: '0.0000',
    });
    await manager.save(created);
    balance = await manager.findOneOrFail(StockBalance, {
      where: { productId, warehouseId },
      lock: { mode: 'pessimistic_write' },
    });
  }
  return balance;
}

export interface ApplyMovementParams {
  productId: string;
  warehouseId: string;
  quantityDelta: string;
  refType: InventoryRefType;
  refId?: string;
  unitCost?: string;
  movementDate: string;
  branchId?: string;
  notes?: string;
  userId?: string;
  grnLineId?: string;
}

export async function applyMovement(
  manager: EntityManager,
  params: ApplyMovementParams
): Promise<InventoryMovement> {
  const deltaStr = parseDecimalStrict(params.quantityDelta);
  const deltaNum = parseFloat(deltaStr);
  validateDeltaForRefType(params.refType, deltaNum);

  const balance = await getOrCreateBalanceLocked(manager, params.productId, params.warehouseId);
  const newQty = decimalAdd(balance.quantity, deltaStr);
  if (decimalIsNegative(newQty)) {
    throw new Error('Insufficient stock: result would be negative');
  }

  balance.quantity = newQty;
  await manager.save(balance);

  const mov = manager.create(InventoryMovement, {
    productId: params.productId,
    warehouseId: params.warehouseId,
    quantityDelta: deltaStr,
    refType: params.refType,
    refId: params.refId,
    unitCost: params.unitCost !== undefined && params.unitCost !== null ? parseDecimalStrict(String(params.unitCost)) : undefined,
    movementDate: params.movementDate,
    branchId: params.branchId,
    notes: params.notes,
    userId: params.userId,
    grnLineId: params.grnLineId,
  });
  return manager.save(mov);
}

export async function assertWarehouseInScope(warehouseId: string, branchId: string | undefined): Promise<Warehouse> {
  const w = await dataSource.getRepository(Warehouse).findOne({ where: { id: warehouseId } });
  if (!w) throw new Error('Warehouse not found');
  if (branchId && w.branchId && w.branchId !== branchId) {
    throw new Error('Warehouse is not available for this branch');
  }
  return w;
}

export async function assertProductInScope(productId: string, branchId: string | undefined): Promise<Product> {
  const p = await dataSource.getRepository(Product).findOne({
    where: { id: productId, deletedAt: IsNull() },
  });
  if (!p) throw new Error('Product not found');
  if (branchId && p.branchId && p.branchId !== branchId) {
    throw new Error('Product is not available for this branch');
  }
  return p;
}

export async function runInTransaction<T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> {
  return dataSource.transaction(fn);
}

export function newBatchRefId(): string {
  return randomUUID();
}
