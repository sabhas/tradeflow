import { BaseEntity, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditLog extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column()
  action!: string;

  @Column()
  entity!: string;

  @Column({ name: 'entity_id', nullable: true })
  entityId?: string;

  @Column({ name: 'old_value', type: 'jsonb', nullable: true })
  oldValue?: Record<string, unknown>;

  @Column({ name: 'new_value', type: 'jsonb', nullable: true })
  newValue?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
