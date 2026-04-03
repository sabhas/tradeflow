import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { SupplierInvoice } from './SupplierInvoice';
import { SupplierPayment } from './SupplierPayment';

@Entity('supplier_payment_allocations')
export class SupplierPaymentAllocation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'supplier_payment_id' })
  supplierPaymentId!: string;

  @ManyToOne(() => SupplierPayment, (p) => p.allocations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'supplier_payment_id' })
  supplierPayment!: SupplierPayment;

  @Column({ name: 'supplier_invoice_id' })
  supplierInvoiceId!: string;

  @ManyToOne(() => SupplierInvoice)
  @JoinColumn({ name: 'supplier_invoice_id' })
  supplierInvoice!: SupplierInvoice;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  amount!: string;
}
