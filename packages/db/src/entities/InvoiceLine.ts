import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Product } from './Product';
import { Invoice } from './Invoice';
import { SalesOrderLine } from './SalesOrderLine';
import { TaxProfile } from './TaxProfile';

@Entity('invoice_lines')
export class InvoiceLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'invoice_id' })
  invoiceId!: string;

  @ManyToOne(() => Invoice, (inv) => inv.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice!: Invoice;

  @Column({ name: 'product_id' })
  productId!: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ name: 'sales_order_line_id', nullable: true })
  salesOrderLineId?: string;

  @ManyToOne(() => SalesOrderLine, { nullable: true })
  @JoinColumn({ name: 'sales_order_line_id' })
  salesOrderLine?: SalesOrderLine;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  quantity!: string;

  @Column({ name: 'unit_price', type: 'decimal', precision: 14, scale: 4 })
  unitPrice!: string;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 14, scale: 4, default: 0 })
  taxAmount!: string;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 14, scale: 4, default: 0 })
  discountAmount!: string;

  @Column({ name: 'tax_profile_id', nullable: true })
  taxProfileId?: string;

  @ManyToOne(() => TaxProfile, { nullable: true })
  @JoinColumn({ name: 'tax_profile_id' })
  taxProfile?: TaxProfile;
}
