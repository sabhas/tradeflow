import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBatchPricesToLayers1777046400000 implements MigrationInterface {
  name = 'AddBatchPricesToLayers1777046400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "grn_lines" ADD COLUMN "trade_price" numeric(14,4), ADD COLUMN "retail_price" numeric(14,4)`
    );
    await queryRunner.query(
      `ALTER TABLE "stock_layers" ADD COLUMN "trade_price" numeric(14,4), ADD COLUMN "retail_price" numeric(14,4)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_layers" DROP COLUMN "retail_price", DROP COLUMN "trade_price"`
    );
    await queryRunner.query(
      `ALTER TABLE "grn_lines" DROP COLUMN "retail_price", DROP COLUMN "trade_price"`
    );
  }
}
