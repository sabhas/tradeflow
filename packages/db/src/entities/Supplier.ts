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

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  telephone?: string;

  @Column({ name: 'mobile_no', nullable: true })
  mobileNo?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  website?: string;

  @Column({ name: 'contact_person', nullable: true })
  contact?: string;

  @Column({ nullable: true })
  ntn?: string;

  @Column({ nullable: true })
  stn?: string;

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
