import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from './Product';
import { PriceLevel } from './PriceLevel';

@Entity('product_prices')
export class ProductPrice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'product_id' })
  productId!: string;

  @ManyToOne(() => Product, (p) => p.productPrices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ name: 'price_level_id' })
  priceLevelId!: string;

  @ManyToOne(() => PriceLevel)
  @JoinColumn({ name: 'price_level_id' })
  priceLevel!: PriceLevel;

  @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 })
  price!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
