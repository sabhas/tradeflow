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
import { User } from './User';
import { Warehouse } from './Warehouse';
import { StockTransferLine } from './StockTransferLine';

@Entity('stock_transfers')
export class StockTransfer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'from_warehouse_id' })
  fromWarehouseId!: string;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'from_warehouse_id' })
  fromWarehouse!: Warehouse;

  @Column({ name: 'to_warehouse_id' })
  toWarehouseId!: string;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'to_warehouse_id' })
  toWarehouse!: Warehouse;

  @Column({ name: 'transfer_date', type: 'date' })
  transferDate!: string;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId?: string;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'branch_id' })
  branch?: Branch;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator?: User;

  @OneToMany(() => StockTransferLine, (l) => l.transfer)
  lines!: StockTransferLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
