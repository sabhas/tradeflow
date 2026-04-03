import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Branch } from './Branch';
import { Customer } from './Customer';
import { User } from './User';
import { QuotationLine } from './QuotationLine';

@Entity('quotations')
export class Quotation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'customer_id' })
  customerId!: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ name: 'quotation_date', type: 'date' })
  quotationDate!: string;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil?: string;

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

  @OneToMany(() => QuotationLine, (l) => l.quotation)
  lines!: QuotationLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
