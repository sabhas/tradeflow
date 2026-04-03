import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Branch } from './Branch';
import { Product } from './Product';
import { User } from './User';
import { Warehouse } from './Warehouse';

export type InventoryRefType =
  | 'opening_balance'
  | 'purchase'
  | 'sale'
  | 'adjustment'
  | 'transfer_in'
  | 'transfer_out';

@Entity('inventory_movements')
@Index(['productId', 'warehouseId', 'movementDate'])
export class InventoryMovement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'product_id' })
  productId!: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ name: 'warehouse_id' })
  warehouseId!: string;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: Warehouse;

  @Column({ name: 'quantity_delta', type: 'decimal', precision: 14, scale: 4 })
  quantityDelta!: string;

  @Column({ name: 'ref_type' })
  refType!: InventoryRefType;

  @Column({ name: 'ref_id', type: 'uuid', nullable: true })
  refId?: string;

  @Column({ name: 'unit_cost', type: 'decimal', precision: 14, scale: 4, nullable: true })
  unitCost?: string;

  @Column({ name: 'movement_date', type: 'date' })
  movementDate!: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId?: string;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'branch_id' })
  branch?: Branch;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
