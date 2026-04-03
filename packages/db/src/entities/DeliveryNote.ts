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
import { Invoice } from './Invoice';
import { SalesOrder } from './SalesOrder';
import { User } from './User';
import { Warehouse } from './Warehouse';
import { DeliveryNoteLine } from './DeliveryNoteLine';
import { DeliveryRunItem } from './DeliveryRunItem';
import { ProofOfDelivery } from './ProofOfDelivery';

@Entity('delivery_notes')
export class DeliveryNote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'invoice_id', nullable: true })
  invoiceId?: string;

  @ManyToOne(() => Invoice, { nullable: true })
  @JoinColumn({ name: 'invoice_id' })
  invoice?: Invoice;

  @Column({ name: 'sales_order_id', nullable: true })
  salesOrderId?: string;

  @ManyToOne(() => SalesOrder, { nullable: true })
  @JoinColumn({ name: 'sales_order_id' })
  salesOrder?: SalesOrder;

  @Column({ name: 'delivery_date', type: 'date', nullable: true })
  deliveryDate?: string;

  @Column({ default: 'pending' })
  status!: string;

  @Column({ name: 'warehouse_id', nullable: true })
  warehouseId?: string;

  @ManyToOne(() => Warehouse, { nullable: true })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse?: Warehouse;

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

  @Column({ name: 'cold_chain_required', default: false })
  coldChainRequired!: boolean;

  @Column({ name: 'controlled_delivery_required', default: false })
  controlledDeliveryRequired!: boolean;

  @Column({ name: 'dispatch_compliance_note', type: 'text', nullable: true })
  dispatchComplianceNote?: string;

  @Column({ name: 'delivery_compliance_note', type: 'text', nullable: true })
  deliveryComplianceNote?: string;

  @OneToMany(() => DeliveryNoteLine, (l) => l.deliveryNote)
  lines?: DeliveryNoteLine[];

  @OneToMany(() => ProofOfDelivery, (p) => p.deliveryNote)
  proofOfDeliveries?: ProofOfDelivery[];

  @OneToMany(() => DeliveryRunItem, (i) => i.deliveryNote)
  runItems?: DeliveryRunItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
