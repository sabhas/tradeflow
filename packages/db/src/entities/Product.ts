import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Supplier } from './Supplier';
import { ProductCategory } from './ProductCategory';
import { UnitOfMeasure } from './UnitOfMeasure';
import { ProductPrice } from './ProductPrice';

@Entity('products')
export class Product extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'supplier_id' })
  supplierId!: string;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id' })
  supplier!: Supplier;

  @Column({ name: 'category_id' })
  categoryId!: string;

  @ManyToOne(() => ProductCategory)
  @JoinColumn({ name: 'category_id' })
  category!: ProductCategory;

  @Column()
  sku!: string;

  @Column({ nullable: true })
  barcode?: string;

  @Column()
  name!: string;

  @Column({ name: 'unit_id' })
  unitId!: string;

  @ManyToOne(() => UnitOfMeasure)
  @JoinColumn({ name: 'unit_id' })
  unit!: UnitOfMeasure;

  @Column({ name: 'cost_price', type: 'decimal', precision: 14, scale: 4, default: 0 })
  costPrice!: string;

  @Column({ name: 'selling_price', type: 'decimal', precision: 14, scale: 4, default: 0 })
  sellingPrice!: string;

  @Column({ name: 'batch_tracked', default: false })
  batchTracked!: boolean;

  @Column({ name: 'expiry_tracked', default: false })
  expiryTracked!: boolean;

  /** Override company default: fifo, lifo, or null to use company settings (FEFO applies when expiry_tracked). */
  @Column({ name: 'costing_method', length: 8, nullable: true })
  costingMethod?: string;

  @Column({ name: 'min_stock', type: 'decimal', precision: 14, scale: 4, nullable: true })
  minStock?: string;

  @Column({ name: 'reorder_level', type: 'decimal', precision: 14, scale: 4, nullable: true })
  reorderLevel?: string;

  /** Supplier / manufacturer catalog or factory code (distinct from internal SKU). */
  @Column({ name: 'manufacturer_code', length: 64, nullable: true })
  manufacturerCode?: string;

  @Column({ name: 'short_name', length: 256, nullable: true })
  shortName?: string;

  @Column({ name: 'generic_name', length: 512, nullable: true })
  genericName?: string;

  /** Consumer pack description, e.g. 50's, 60ml. */
  @Column({ name: 'packing', length: 128, nullable: true })
  packing?: string;

  @Column({ name: 'hs_code', length: 32, nullable: true })
  hsCode?: string;

  @Column({ name: 'retail_price', type: 'decimal', precision: 14, scale: 4, default: 0 })
  retailPrice!: string;

  @Column({ name: 'cut_price', type: 'decimal', precision: 14, scale: 4, default: 0 })
  cutPrice!: string;

  @Column({ name: 'purchase_discount_pct', type: 'decimal', precision: 8, scale: 4, nullable: true })
  purchaseDiscountPct?: string;

  @Column({ name: 'sales_discount_pct', type: 'decimal', precision: 8, scale: 4, nullable: true })
  salesDiscountPct?: string;

  @Column({ name: 'purchase_sales_tax_pct', type: 'decimal', precision: 8, scale: 4, nullable: true })
  purchaseSalesTaxPct?: string;

  @Column({ name: 'purchase_withholding_tax_pct', type: 'decimal', precision: 8, scale: 4, nullable: true })
  purchaseWithholdingTaxPct?: string;

  @Column({ name: 'purchase_further_tax_pct', type: 'decimal', precision: 8, scale: 4, nullable: true })
  purchaseFurtherTaxPct?: string;

  @Column({ name: 'sales_sales_tax_pct', type: 'decimal', precision: 8, scale: 4, nullable: true })
  salesSalesTaxPct?: string;

  @Column({ name: 'sales_withholding_tax_pct', type: 'decimal', precision: 8, scale: 4, nullable: true })
  salesWithholdingTaxPct?: string;

  @Column({ name: 'sales_further_tax_pct', type: 'decimal', precision: 8, scale: 4, nullable: true })
  salesFurtherTaxPct?: string;

  /** FBR / jurisdiction sale classification (free text or code). */
  @Column({ name: 'sale_type', length: 64, nullable: true })
  saleType?: string;

  @Column({ name: 'sale_rate_pct', type: 'decimal', precision: 8, scale: 4, nullable: true })
  saleRatePct?: string;

  @Column({ name: 'sro_schedule', length: 128, nullable: true })
  sroSchedule?: string;

  @Column({ name: 'sro_item_serial', length: 128, nullable: true })
  sroItemSerial?: string;

  @Column({ name: 'is_herbal', default: false })
  isHerbal!: boolean;

  @Column({ name: 'is_narcotic', default: false })
  isNarcotic!: boolean;

  @Column({ name: 'is_fridged', default: false })
  isFridged!: boolean;

  @Column({ name: 'is_surgical', default: false })
  isSurgical!: boolean;

  @Column({ name: 'stax_before_discount', default: false })
  staxBeforeDiscount!: boolean;

  @Column({ name: 'stax_on_retail', default: false })
  staxOnRetail!: boolean;

  @Column({ name: 'stax_on_bonus_sale', default: false })
  staxOnBonusSale!: boolean;

  @Column({ name: 'stax_on_bonus_purchase', default: false })
  staxOnBonusPurchase!: boolean;

  @Column({ name: 'trade_price_all_batches', default: false })
  tradePriceAllBatches!: boolean;

  @Column({ name: 'auto_price_from_retail', default: false })
  autoPriceFromRetail!: boolean;

  @Column({ name: 'print_net_price_on_invoice', default: false })
  printNetPriceOnInvoice!: boolean;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @OneToMany(() => ProductPrice, (pp) => pp.product)
  productPrices!: ProductPrice[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
