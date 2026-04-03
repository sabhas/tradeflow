import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Branch } from './Branch';
import { Customer } from './Customer';
import { User } from './User';
import { ReceiptAllocation } from './ReceiptAllocation';

@Entity('receipts')
@Index(['customerId'])
export class Receipt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'customer_id' })
  customerId!: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ name: 'receipt_date', type: 'date' })
  receiptDate!: string;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  amount!: string;

  @Column({ name: 'payment_method' })
  paymentMethod!: string;

  @Column({ nullable: true })
  reference?: string;

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

  @OneToMany(() => ReceiptAllocation, (a) => a.receipt)
  allocations!: ReceiptAllocation[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
