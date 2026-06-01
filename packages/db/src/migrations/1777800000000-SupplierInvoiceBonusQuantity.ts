import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupplierInvoiceBonusQuantity1777800000000 implements MigrationInterface {
  name = 'SupplierInvoiceBonusQuantity1777800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "supplier_invoice_lines" ADD "bonus_quantity" numeric(14,4) NOT NULL DEFAULT '0'
    `);
    await queryRunner.query(`
      ALTER TABLE "grn_lines" ADD "bonus_quantity" numeric(14,4) NOT NULL DEFAULT '0'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "grn_lines" DROP COLUMN "bonus_quantity"`);
    await queryRunner.query(`ALTER TABLE "supplier_invoice_lines" DROP COLUMN "bonus_quantity"`);
  }
}
