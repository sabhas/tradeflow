import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Account } from './Account';

@Entity('company_settings')
export class CompanySettings {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'default_cash_account_id' })
  defaultCashAccountId!: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'default_cash_account_id' })
  defaultCashAccount!: Account;

  @Column({ name: 'default_bank_account_id' })
  defaultBankAccountId!: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'default_bank_account_id' })
  defaultBankAccount!: Account;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
