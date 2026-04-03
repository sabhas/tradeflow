import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Customer } from './Customer';
import { DeliveryRoute } from './DeliveryRoute';

@Entity('route_stops')
export class RouteStop {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'route_id' })
  routeId!: string;

  @ManyToOne(() => DeliveryRoute, (r) => r.stops, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'route_id' })
  route!: DeliveryRoute;

  @Column({ name: 'sequence_order' })
  sequenceOrder!: number;

  @Column({ name: 'customer_id', nullable: true })
  customerId?: string;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;

  @Column({ name: 'address_line', type: 'text', nullable: true })
  addressLine?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
