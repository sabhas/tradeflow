import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BaseEntity,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

@Entity('accounts')
export class Account extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  code!: string;

  @Column()
  name!: string;

  @Column({ type: 'varchar', length: 32 })
  type!: AccountType;

  @Column({ name: 'parent_id', nullable: true })
  parentId?: string;

  @Column({ name: 'is_system', default: false })
  isSystem!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
