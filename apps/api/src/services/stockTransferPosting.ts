import { EntityManager } from 'typeorm';
import { InventoryMovement, StockTransfer, StockTransferLine } from '@tradeflow/db';
import { decimalAdd, parseDecimalStrict } from '../utils/decimal';
import { addInboundLayer, consumeFromLayers, insertLayerConsumptions, loadCompanyForInventory } from './stockLayerService';
import { assertProductInScope, assertWarehouseInScope, getOrCreateBalanceLocked } from './inventoryService';

export async function postStockTransferTx(
  manager: EntityManager,
  transfer: StockTransfer,
  lines: StockTransferLine[],
  userId: string | undefined,
  branchId: string | undefined
): Promise<void> {
  if (transfer.fromWarehouseId === transfer.toWarehouseId) {
    throw new Error('Source and destination warehouse must differ');
  }

  const company = await loadCompanyForInventory(manager);

  for (const line of lines) {
    const product = await assertProductInScope(line.productId, branchId);
    await assertWarehouseInScope(transfer.fromWarehouseId, branchId);
    await assertWarehouseInScope(transfer.toWarehouseId, branchId);

    const qtyStr = parseDecimalStrict(line.quantity);
    if (parseFloat(qtyStr) <= 0) continue;

    const { avgUnitCost, consumptions } = await consumeFromLayers(
      manager,
      product,
      company,
      transfer.fromWarehouseId,
      qtyStr
    );

    const srcBal = await getOrCreateBalanceLocked(manager, line.productId, transfer.fromWarehouseId);
    const srcNew = decimalAdd(srcBal.quantity, (-parseFloat(qtyStr)).toFixed(4));
    srcBal.quantity = srcNew;
    await manager.save(srcBal);

    const movOut = manager.create(InventoryMovement, {
      productId: line.productId,
      warehouseId: transfer.fromWarehouseId,
      quantityDelta: (-parseFloat(qtyStr)).toFixed(4),
      refType: 'transfer_out',
      refId: transfer.id,
      unitCost: avgUnitCost,
      movementDate: transfer.transferDate,
      branchId: transfer.branchId ?? branchId,
      notes: transfer.notes ?? undefined,
      userId,
      stockTransferLineId: line.id,
    });
    const savedOut = await manager.save(movOut);
    await insertLayerConsumptions(manager, savedOut.id, consumptions);

    const destBal = await getOrCreateBalanceLocked(manager, line.productId, transfer.toWarehouseId);
    for (const c of consumptions) {
      await addInboundLayer(manager, {
        productId: line.productId,
        warehouseId: transfer.toWarehouseId,
        quantity: c.quantity,
        unitCost: c.unitCost,
        sourceRefType: 'transfer_in',
        sourceRefId: transfer.id,
        branchId: transfer.branchId ?? branchId,
        batchCode: c.batchCode,
        expiryDate: c.expiryDate,
      });
      destBal.quantity = decimalAdd(destBal.quantity, c.quantity);
    }
    await manager.save(destBal);

    const movIn = manager.create(InventoryMovement, {
      productId: line.productId,
      warehouseId: transfer.toWarehouseId,
      quantityDelta: qtyStr,
      refType: 'transfer_in',
      refId: transfer.id,
      unitCost: avgUnitCost,
      movementDate: transfer.transferDate,
      branchId: transfer.branchId ?? branchId,
      notes: transfer.notes ?? undefined,
      userId,
      stockTransferLineId: line.id,
    });
    await manager.save(movIn);
  }
}
