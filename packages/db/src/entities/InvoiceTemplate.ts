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

export type InvoiceTemplateConfig = {
  showLogo?: boolean;
  showLegalName?: boolean;
  showTaxNumber?: boolean;
  showPaymentTerms?: boolean;
  showNotes?: boolean;
};

@Entity('invoice_templates')
export class InvoiceTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 128 })
  name!: string;

  @Column({ type: 'jsonb' })
  config!: InvoiceTemplateConfig;

  @Column({ name: 'branch_id', nullable: true })
  branchId?: string;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'branch_id' })
  branch?: Branch;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
