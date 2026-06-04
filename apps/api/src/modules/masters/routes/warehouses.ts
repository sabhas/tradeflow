import { createWarehouseSchema, paginationQuerySchema, updateWarehouseSchema } from '@tradeflow/shared';
import { createCrudRouter } from '../../../shared/routing/createCrudRouter';
import * as warehousesController from '../controllers/warehousesController';

export const warehousesRouter = createCrudRouter({
  permission: { module: 'masters.warehouses', read: 'read', write: 'write' },
  auditEntity: 'Warehouse',
  createSchema: createWarehouseSchema,
  updateSchema: updateWarehouseSchema,
  listQuerySchema: paginationQuerySchema,
  controller: {
    list: warehousesController.listWarehouses,
    get: warehousesController.getWarehouse,
    create: warehousesController.createWarehouse,
    update: warehousesController.updateWarehouse,
    getSnapshotForAudit: warehousesController.getWarehouseSnapshotForAudit,
  },
  includeDelete: false,
});
