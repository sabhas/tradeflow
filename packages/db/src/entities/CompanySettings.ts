import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Account } from './Account';
import { InvoiceTemplate } from './InvoiceTemplate';

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

  @Column({ name: 'company_name', length: 255, default: 'Your company' })
  companyName!: string;

  @Column({ name: 'legal_name', length: 255, nullable: true })
  legalName?: string;

  @Column({ name: 'address_line1', length: 255, nullable: true })
  addressLine1?: string;

  @Column({ name: 'address_line2', length: 255, nullable: true })
  addressLine2?: string;

  @Column({ name: 'city', length: 128, nullable: true })
  city?: string;

  @Column({ name: 'state', length: 128, nullable: true })
  state?: string;

  @Column({ name: 'postal_code', length: 32, nullable: true })
  postalCode?: string;

  @Column({ name: 'country', length: 128, nullable: true })
  country?: string;

  @Column({ name: 'phone', length: 64, nullable: true })
  phone?: string;

  @Column({ name: 'email', length: 255, nullable: true })
  email?: string;

  @Column({ name: 'tax_registration_number', length: 128, nullable: true })
  taxRegistrationNumber?: string;

  @Column({ name: 'logo_url', length: 2048, nullable: true })
  logoUrl?: string;

  @Column({ name: 'financial_year_start_month', type: 'smallint', default: 1 })
  financialYearStartMonth!: number;

  @Column({ name: 'financial_year_label_override', length: 64, nullable: true })
  financialYearLabelOverride?: string;

  @Column({ name: 'currency_code', length: 3, default: 'USD' })
  currencyCode!: string;

  @Column({ name: 'money_decimals', type: 'smallint', default: 2 })
  moneyDecimals!: number;

  @Column({ name: 'quantity_decimals', type: 'smallint', default: 2 })
  quantityDecimals!: number;

  @Column({ name: 'rounding_mode', length: 32, default: 'half_up' })
  roundingMode!: string;

  @Column({ name: 'default_invoice_template_id', nullable: true })
  defaultInvoiceTemplateId?: string;

  @ManyToOne(() => InvoiceTemplate, { nullable: true })
  @JoinColumn({ name: 'default_invoice_template_id' })
  defaultInvoiceTemplate?: InvoiceTemplate;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
