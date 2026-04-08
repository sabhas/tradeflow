import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Supplier } from './Supplier';
import { User } from './User';
import { SupplierPaymentAllocation } from './SupplierPaymentAllocation';

@Entity('supplier_payments')
@Index(['supplierId'])
export class SupplierPayment extends BaseEntity {
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
