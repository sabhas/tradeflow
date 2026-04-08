import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductExtendedProfileFields1775693600000 implements MigrationInterface {
  name = 'AddProductExtendedProfileFields1775693600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" ADD "manufacturer_code" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "products" ADD "short_name" character varying(256)`);
    await queryRunner.query(`ALTER TABLE "products" ADD "generic_name" character varying(512)`);
    await queryRunner.query(`ALTER TABLE "products" ADD "packing" character varying(128)`);
    await queryRunner.query(`ALTER TABLE "products" ADD "hs_code" character varying(32)`);
    await queryRunner.query(
      `ALTER TABLE "products" ADD "retail_price" numeric(14,4) NOT NULL DEFAULT '0'`
    );
    await queryRunner.query(`ALTER TABLE "products" ADD "cut_price" numeric(14,4) NOT NULL DEFAULT '0'`);
    await queryRunner.query(`ALTER TABLE "products" ADD "purchase_discount_pct" numeric(8,4)`);
    await queryRunner.query(`ALTER TABLE "products" ADD "sales_discount_pct" numeric(8,4)`);
    await queryRunner.query(`ALTER TABLE "products" ADD "purchase_sales_tax_pct" numeric(8,4)`);
    await queryRunner.query(`ALTER TABLE "products" ADD "purchase_withholding_tax_pct" numeric(8,4)`);
    await queryRunner.query(`ALTER TABLE "products" ADD "purchase_further_tax_pct" numeric(8,4)`);
    await queryRunner.query(`ALTER TABLE "products" ADD "sales_sales_tax_pct" numeric(8,4)`);
    await queryRunner.query(`ALTER TABLE "products" ADD "sales_withholding_tax_pct" numeric(8,4)`);
    await queryRunner.query(`ALTER TABLE "products" ADD "sales_further_tax_pct" numeric(8,4)`);
    await queryRunner.query(`ALTER TABLE "products" ADD "sale_type" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "products" ADD "sale_rate_pct" numeric(8,4)`);
    await queryRunner.query(`ALTER TABLE "products" ADD "sro_schedule" character varying(128)`);
    await queryRunner.query(`ALTER TABLE "products" ADD "sro_item_serial" character varying(128)`);
    await queryRunner.query(`ALTER TABLE "products" ADD "is_herbal" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "products" ADD "is_narcotic" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "products" ADD "is_fridged" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "products" ADD "is_surgical" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "products" ADD "stax_before_discount" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "products" ADD "stax_on_retail" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "products" ADD "stax_on_bonus_sale" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "products" ADD "stax_on_bonus_purchase" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "products" ADD "trade_price_all_batches" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "products" ADD "auto_price_from_retail" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(
      `ALTER TABLE "products" ADD "print_net_price_on_invoice" boolean NOT NULL DEFAULT false`
    );
    await queryRunner.query(`ALTER TABLE "products" ADD "is_active" boolean NOT NULL DEFAULT true`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "is_active"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "print_net_price_on_invoice"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "auto_price_from_retail"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "trade_price_all_batches"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "stax_on_bonus_purchase"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "stax_on_bonus_sale"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "stax_on_retail"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "stax_before_discount"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "is_surgical"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "is_fridged"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "is_narcotic"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "is_herbal"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "sro_item_serial"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "sro_schedule"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "sale_rate_pct"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "sale_type"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "sales_further_tax_pct"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "sales_withholding_tax_pct"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "sales_sales_tax_pct"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "purchase_further_tax_pct"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "purchase_withholding_tax_pct"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "purchase_sales_tax_pct"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "sales_discount_pct"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "purchase_discount_pct"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "cut_price"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "retail_price"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "hs_code"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "packing"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "generic_name"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "short_name"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "manufacturer_code"`);
  }
}
