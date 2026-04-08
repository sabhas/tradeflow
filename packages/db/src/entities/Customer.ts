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
import { PaymentTerms } from './PaymentTerms';
import { TaxProfile } from './TaxProfile';
import { Town } from './Town';

@Entity('customers')
export class Customer extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ name: 'long_name', type: 'varchar', nullable: true })
  longName?: string;

  /** retailer | wholesaler | walk_in */
  @Column()
  type!: string;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ name: 'town_id', type: 'uuid', nullable: true })
  townId?: string | null;

  @ManyToOne(() => Town, { nullable: true })
  @JoinColumn({ name: 'town_id' })
  town?: Town;

  @Column({ name: 'area_id', type: 'uuid', nullable: true })
  areaId?: string | null;

  @ManyToOne(() => Area, { nullable: true })
  @JoinColumn({ name: 'area_id' })
  area?: Area;

  @Column({ name: 'telephone', type: 'varchar', nullable: true })
  telephone?: string;

  @Column({ name: 'mobile', type: 'varchar', nullable: true })
  mobile?: string;

  @Column({ name: 'contact_person', type: 'varchar', nullable: true })
  contactPerson?: string;

  @Column({ type: 'varchar', nullable: true })
  ntn?: string;

  @Column({ type: 'varchar', nullable: true })
  stn?: string;

  /** unregistered | registered | exempt */
  @Column({ name: 'sales_tax_status', default: 'unregistered' })
  salesTaxStatus!: string;

  @Column({ name: 'is_filer', default: false })
  isFiler!: boolean;

  @Column({ name: 'license_no', type: 'varchar', nullable: true })
  licenseNo?: string;

  @Column({ name: 'license_expiry_date', type: 'date', nullable: true })
  licenseExpiryDate?: string | null;

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

  @Column({ name: 'default_route_id', type: 'uuid', nullable: true })
  defaultRouteId?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
