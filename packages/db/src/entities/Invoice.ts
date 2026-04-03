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
import { Customer } from './Customer';
import { User } from './User';
import { Warehouse } from './Warehouse';
import { SalesOrder } from './SalesOrder';
import { InvoiceLine } from './InvoiceLine';

@Entity('invoices')
@Index(['customerId', 'status'])
@Index(['invoiceDate'])
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'customer_id' })
  customerId!: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ name: 'invoice_date', type: 'date' })
  invoiceDate!: string;

  @Column({ name: 'due_date', type: 'date' })
  dueDate!: string;

  @Column({ default: 'draft' })
  status!: string;

  /** cash | credit */
  @Column({ name: 'payment_type', default: 'credit' })
  paymentType!: string;

  @Column({ name: 'warehouse_id' })
  warehouseId!: string;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: Warehouse;

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

  @Column({ name: 'sales_order_id', nullable: true })
  salesOrderId?: string;

  @ManyToOne(() => SalesOrder, { nullable: true })
  @JoinColumn({ name: 'sales_order_id' })
  salesOrder?: SalesOrder;

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

  @OneToMany(() => InvoiceLine, (l) => l.invoice)
  lines!: InvoiceLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
