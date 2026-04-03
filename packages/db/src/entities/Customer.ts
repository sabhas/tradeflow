import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Branch } from './Branch';
import { PaymentTerms } from './PaymentTerms';
import { TaxProfile } from './TaxProfile';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  /** retailer | wholesaler | walk_in */
  @Column()
  type!: string;

  @Column({ type: 'jsonb', nullable: true })
  contact?: Record<string, unknown>;

  @Column({ name: 'credit_limit', type: 'decimal', precision: 14, scale: 4, default: 0 })
  creditLimit!: string;

  @Column({ name: 'payment_terms_id', nullable: true })
  paymentTermsId?: string;

  @ManyToOne(() => PaymentTerms, { nullable: true })
  @JoinColumn({ name: 'payment_terms_id' })
  paymentTerms?: PaymentTerms;

  @Column({ name: 'tax_profile_id', nullable: true })
  taxProfileId?: string;

  @ManyToOne(() => TaxProfile, { nullable: true })
  @JoinColumn({ name: 'tax_profile_id' })
  taxProfile?: TaxProfile;

  @Column({ name: 'branch_id', nullable: true })
  branchId?: string;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'branch_id' })
  branch?: Branch;

  @Column({ name: 'default_route_id', type: 'uuid', nullable: true })
  defaultRouteId?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
