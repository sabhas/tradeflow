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
import { PaymentTerms } from './PaymentTerms';
import { TaxProfile } from './TaxProfile';

@Entity('suppliers')
export class Supplier extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ type: 'jsonb', nullable: true })
  contact?: Record<string, unknown>;

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

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
