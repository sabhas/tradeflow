import { MigrationInterface, QueryRunner } from 'typeorm';

export class SalesOrderBonusQuantity1777900000000 implements MigrationInterface {
  name = 'SalesOrderBonusQuantity1777900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_order_lines" ADD "bonus_quantity" numeric(14,4) NOT NULL DEFAULT '0'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales_order_lines" DROP COLUMN "bonus_quantity"`);
  }
}
