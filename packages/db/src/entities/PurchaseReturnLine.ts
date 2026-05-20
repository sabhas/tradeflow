import { BaseEntity, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { GrnLine } from './GrnLine';
import { Product } from './Product';
import { PurchaseReturn } from './PurchaseReturn';
import { TaxProfile } from './TaxProfile';

@Entity('purchase_return_lines')
export class PurchaseReturnLine extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'purchase_return_id' })
  purchaseReturnId!: string;

  @ManyToOne(() => PurchaseReturn, (r) => r.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchase_return_id' })
  purchaseReturn!: PurchaseReturn;

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

  @Column({ name: 'grn_line_id', type: 'uuid', nullable: true })
  grnLineId?: string;

  @ManyToOne(() => GrnLine, { nullable: true })
  @JoinColumn({ name: 'grn_line_id' })
  grnLine?: GrnLine;
}
