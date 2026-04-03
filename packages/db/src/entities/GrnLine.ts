import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Grn } from './Grn';
import { Product } from './Product';
import { PurchaseOrderLine } from './PurchaseOrderLine';

@Entity('grn_lines')
export class GrnLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'grn_id' })
  grnId!: string;

  @ManyToOne(() => Grn, (g) => g.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'grn_id' })
  grn!: Grn;

  @Column({ name: 'product_id' })
  productId!: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  quantity!: string;

  @Column({ name: 'unit_price', type: 'decimal', precision: 14, scale: 4, default: 0 })
  unitPrice!: string;

  @Column({ name: 'purchase_order_line_id', nullable: true })
  purchaseOrderLineId?: string;

  @ManyToOne(() => PurchaseOrderLine, { nullable: true })
  @JoinColumn({ name: 'purchase_order_line_id' })
  purchaseOrderLine?: PurchaseOrderLine;
}
