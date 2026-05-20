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
  UpdateDateColumn,
} from 'typeorm';
import { Grn } from './Grn';
import { Supplier } from './Supplier';
import { User } from './User';
import { Warehouse } from './Warehouse';
import { PurchaseReturnLine } from './PurchaseReturnLine';

@Entity('purchase_returns')
@Index(['supplierId'])
export class PurchaseReturn extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'supplier_id' })
  supplierId!: string;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id' })
  supplier!: Supplier;

  @Column({ name: 'return_date', type: 'date' })
  returnDate!: string;

  @Column({ name: 'warehouse_id' })
  warehouseId!: string;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: Warehouse;

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

  @Column({ name: 'grn_id', type: 'uuid', nullable: true })
  grnId?: string;

  @ManyToOne(() => Grn, { nullable: true })
  @JoinColumn({ name: 'grn_id' })
  grn?: Grn;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator?: User;

  @OneToMany(() => PurchaseReturnLine, (l) => l.purchaseReturn)
  lines!: PurchaseReturnLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
