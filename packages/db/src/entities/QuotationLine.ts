import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Product } from './Product';
import { Quotation } from './Quotation';
import { TaxProfile } from './TaxProfile';

@Entity('quotation_lines')
export class QuotationLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'quotation_id' })
  quotationId!: string;

  @ManyToOne(() => Quotation, (q) => q.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quotation_id' })
  quotation!: Quotation;

  @Column({ name: 'product_id' })
  productId!: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  quantity!: string;

  @Column({ name: 'unit_price', type: 'decimal', precision: 14, scale: 4 })
  unitPrice!: string;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 14, scale: 4, default: 0 })
  taxAmount!: string;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 14, scale: 4, default: 0 })
  discountAmount!: string;

  @Column({ name: 'tax_profile_id', nullable: true })
  taxProfileId?: string;

  @ManyToOne(() => TaxProfile, { nullable: true })
  @JoinColumn({ name: 'tax_profile_id' })
  taxProfile?: TaxProfile;
}
