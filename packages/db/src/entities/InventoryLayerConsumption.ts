import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { InventoryMovement } from './InventoryMovement';
import { StockLayer } from './StockLayer';

@Entity('inventory_layer_consumptions')
export class InventoryLayerConsumption {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'inventory_movement_id' })
  inventoryMovementId!: string;

  @ManyToOne(() => InventoryMovement, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inventory_movement_id' })
  inventoryMovement!: InventoryMovement;

  @Column({ name: 'stock_layer_id' })
  stockLayerId!: string;

  @ManyToOne(() => StockLayer)
  @JoinColumn({ name: 'stock_layer_id' })
  stockLayer!: StockLayer;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  quantity!: string;

  @Column({ name: 'unit_cost', type: 'decimal', precision: 14, scale: 4 })
  unitCost!: string;
}
