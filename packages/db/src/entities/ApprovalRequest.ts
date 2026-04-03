import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Branch } from './Branch';
import { User } from './User';

@Entity('approval_requests')
export class ApprovalRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'entity_type', length: 64 })
  entityType!: string;

  @Column({ name: 'entity_id' })
  entityId!: string;

  @Column({ length: 16, default: 'pending' })
  status!: string;

  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedBy?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'requested_by' })
  requester?: User;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer?: User;

  @Column({ name: 'review_note', type: 'text', nullable: true })
  reviewNote?: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId?: string;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'branch_id' })
  branch?: Branch;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt?: Date;
}
