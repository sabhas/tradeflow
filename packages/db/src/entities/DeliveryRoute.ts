import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Branch } from './Branch';
import { RouteStop } from './RouteStop';

@Entity('delivery_routes')
export class DeliveryRoute extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column()
  code!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'branch_id', nullable: true })
  branchId?: string;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'branch_id' })
  branch?: Branch;

  @OneToMany(() => RouteStop, (s) => s.route)
  stops?: RouteStop[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
