import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Area } from './Area';

@Entity('towns')
export class Town extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ name: 'area_id', type: 'uuid', nullable: true })
  areaId?: string;

  @ManyToOne(() => Area, (a) => a.towns, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'area_id' })
  area?: Area;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
