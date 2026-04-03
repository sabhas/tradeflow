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
import { DeliveryRoute } from './DeliveryRoute';
import { Salesperson } from './Salesperson';
import { User } from './User';
import { DeliveryRunItem } from './DeliveryRunItem';

@Entity('delivery_runs')
export class DeliveryRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'run_date', type: 'date' })
  runDate!: string;

  @Column({ name: 'route_id' })
  routeId!: string;

  @ManyToOne(() => DeliveryRoute)
  @JoinColumn({ name: 'route_id' })
  route!: DeliveryRoute;

  @Column({ name: 'vehicle_info', nullable: true })
  vehicleInfo?: string;

  @Column({ name: 'driver_salesperson_id', nullable: true })
  driverSalespersonId?: string;

  @ManyToOne(() => Salesperson, { nullable: true })
  @JoinColumn({ name: 'driver_salesperson_id' })
  driverSalesperson?: Salesperson;

  @Column({ default: 'draft' })
  status!: string;

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

  @OneToMany(() => DeliveryRunItem, (x) => x.deliveryRun)
  items?: DeliveryRunItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
