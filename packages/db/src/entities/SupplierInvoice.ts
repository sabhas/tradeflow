import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Branch } from './Branch';
import { Grn } from './Grn';
import { PurchaseOrder } from './PurchaseOrder';
import { Supplier } from './Supplier';
import { User } from './User';
import { SupplierInvoiceLine } from './SupplierInvoiceLine';

@Entity('supplier_invoices')
@Index(['supplierId'])
export class SupplierInvoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'supplier_id' })
  supplierId!: string;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id' })
  supplier!: Supplier;

  @Column({ name: 'invoice_number' })
  invoiceNumber!: string;

  @Column({ name: 'invoice_date', type: 'date' })
  invoiceDate!: string;

  @Column({ name: 'due_date', type: 'date' })
  dueDate!: string;

  @Column({ name: 'purchase_order_id', nullable: true })
  purchaseOrderId?: string;

  @ManyToOne(() => PurchaseOrder, { nullable: true })
  @JoinColumn({ name: 'purchase_order_id' })
  purchaseOrder?: PurchaseOrder;

  @Column({ name: 'grn_id', nullable: true })
  grnId?: string;

  @ManyToOne(() => Grn, { nullable: true })
  @JoinColumn({ name: 'grn_id' })
  grn?: Grn;

  @Column({ default: 'draft' })
  status!: string;

  @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 })
  subtotal!: string;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 14, scale: 4, default: 0 })
  taxAmount!: string;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 14, scale: 4, default: 0 })
  discountAmount!: string;

  @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 })
  total!: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'branch_id', nullable: true })
  branchId?: string;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'branch_id' })
  branch?: Branch;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator?: User;

  @OneToMany(() => SupplierInvoiceLine, (l) => l.supplierInvoice)
  lines!: SupplierInvoiceLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
