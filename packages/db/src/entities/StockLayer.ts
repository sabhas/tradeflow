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
import { GrnLine } from './GrnLine';
import { Product } from './Product';
import { Warehouse } from './Warehouse';

@Entity('stock_layers')
@Index(['productId', 'warehouseId'])
export class StockLayer {
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

  @Column({ name: 'quantity_remaining', type: 'decimal', precision: 14, scale: 4 })
  quantityRemaining!: string;

  @Column({ name: 'unit_cost', type: 'decimal', precision: 14, scale: 4 })
  unitCost!: string;

  @Column({ name: 'batch_code', type: 'varchar', length: 128, nullable: true })
  batchCode?: string;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate?: string;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @Column({ name: 'source_ref_type', type: 'varchar', length: 32 })
  sourceRefType!: string;

  @Column({ name: 'source_ref_id', type: 'uuid', nullable: true })
  sourceRefId?: string;

  @Column({ name: 'grn_line_id', type: 'uuid', nullable: true })
  grnLineId?: string;

  @ManyToOne(() => GrnLine, { nullable: true })
  @JoinColumn({ name: 'grn_line_id' })
  grnLine?: GrnLine;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId?: string;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'branch_id' })
  branch?: Branch;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
