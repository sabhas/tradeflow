import { BaseEntity, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Branch } from './Branch';
import { User } from './User';

@Entity('user_branches')
export class UserBranch extends BaseEntity {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @PrimaryColumn('uuid', { name: 'branch_id' })
  branchId!: string;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branch_id' })
  branch!: Branch;

  @Column({ name: 'is_default', default: false })
  isDefault!: boolean;
}
