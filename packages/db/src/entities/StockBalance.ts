import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { Product } from './Product';
import { Warehouse } from './Warehouse';

@Entity('stock_balances')
@Unique(['productId', 'warehouseId'])
@Index(['productId', 'warehouseId'])
export class StockBalance {
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

  @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 })
  quantity!: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
