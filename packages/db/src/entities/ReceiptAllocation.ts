import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Invoice } from './Invoice';
import { Receipt } from './Receipt';

@Entity('receipt_allocations')
@Index(['receiptId', 'invoiceId'])
export class ReceiptAllocation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'receipt_id' })
  receiptId!: string;

  @ManyToOne(() => Receipt, (r) => r.allocations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'receipt_id' })
  receipt!: Receipt;

  @Column({ name: 'invoice_id' })
  invoiceId!: string;

  @ManyToOne(() => Invoice)
  @JoinColumn({ name: 'invoice_id' })
  invoice!: Invoice;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  amount!: string;
}
