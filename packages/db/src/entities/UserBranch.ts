import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Branch } from './Branch';
import { User } from './User';

@Entity('user_branches')
export class UserBranch {
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
