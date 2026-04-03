import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Product } from './Product';
import { SalesOrder } from './SalesOrder';
import { TaxProfile } from './TaxProfile';

@Entity('sales_order_lines')
export class SalesOrderLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'sales_order_id' })
  salesOrderId!: string;

  @ManyToOne(() => SalesOrder, (o) => o.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sales_order_id' })
  salesOrder!: SalesOrder;

  @Column({ name: 'product_id' })
  productId!: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  quantity!: string;

  @Column({ name: 'unit_price', type: 'decimal', precision: 14, scale: 4 })
  unitPrice!: string;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 14, scale: 4, default: 0 })
  taxAmount!: string;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 14, scale: 4, default: 0 })
  discountAmount!: string;

  @Column({ name: 'delivered_quantity', type: 'decimal', precision: 14, scale: 4, default: 0 })
  deliveredQuantity!: string;

  @Column({ name: 'tax_profile_id', nullable: true })
  taxProfileId?: string;

  @ManyToOne(() => TaxProfile, { nullable: true })
  @JoinColumn({ name: 'tax_profile_id' })
  taxProfile?: TaxProfile;
}
