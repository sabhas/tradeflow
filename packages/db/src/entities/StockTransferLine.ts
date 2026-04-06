import { BaseEntity, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Product } from './Product';
import { StockTransfer } from './StockTransfer';

@Entity('stock_transfer_lines')
export class StockTransferLine extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'transfer_id' })
  transferId!: string;

  @ManyToOne(() => StockTransfer, (t) => t.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transfer_id' })
  transfer!: StockTransfer;

  @Column({ name: 'product_id' })
  productId!: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  quantity!: string;
}
