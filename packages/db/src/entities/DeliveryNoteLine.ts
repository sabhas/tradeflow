import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { DeliveryNote } from './DeliveryNote';
import { InvoiceLine } from './InvoiceLine';
import { Product } from './Product';
import { SalesOrderLine } from './SalesOrderLine';

@Entity('delivery_note_lines')
export class DeliveryNoteLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'delivery_note_id' })
  deliveryNoteId!: string;

  @ManyToOne(() => DeliveryNote, (n) => n.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'delivery_note_id' })
  deliveryNote!: DeliveryNote;

  @Column({ name: 'product_id' })
  productId!: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  quantity!: string;

  @Column({ name: 'invoice_line_id', nullable: true })
  invoiceLineId?: string;

  @ManyToOne(() => InvoiceLine, { nullable: true })
  @JoinColumn({ name: 'invoice_line_id' })
  invoiceLine?: InvoiceLine;

  @Column({ name: 'sales_order_line_id', nullable: true })
  salesOrderLineId?: string;

  @ManyToOne(() => SalesOrderLine, { nullable: true })
  @JoinColumn({ name: 'sales_order_line_id' })
  salesOrderLine?: SalesOrderLine;
}
