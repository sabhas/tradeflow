import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Branch } from './Branch';
import { Supplier } from './Supplier';
import { ProductCategory } from './ProductCategory';
import { UnitOfMeasure } from './UnitOfMeasure';
import { ProductPrice } from './ProductPrice';

@Entity('products')
export class Product {
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

  @Column({ name: 'branch_id', nullable: true })
  branchId?: string;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'branch_id' })
  branch?: Branch;

  @OneToMany(() => ProductPrice, (pp) => pp.product)
  productPrices!: ProductPrice[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
