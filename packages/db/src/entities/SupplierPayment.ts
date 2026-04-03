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
import { Supplier } from './Supplier';
import { User } from './User';
import { SupplierPaymentAllocation } from './SupplierPaymentAllocation';

@Entity('supplier_payments')
@Index(['supplierId'])
export class SupplierPayment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'supplier_id' })
  supplierId!: string;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id' })
  supplier!: Supplier;

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate!: string;

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

  @OneToMany(() => SupplierPaymentAllocation, (a) => a.supplierPayment)
  allocations!: SupplierPaymentAllocation[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
