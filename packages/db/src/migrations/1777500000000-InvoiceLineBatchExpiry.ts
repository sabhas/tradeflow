import { MigrationInterface, QueryRunner } from 'typeorm';

export class InvoiceLineBatchExpiry1777500000000 implements MigrationInterface {
  name = 'InvoiceLineBatchExpiry1777500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoice_lines" ADD "batch_code" character varying(128)
    `);
    await queryRunner.query(`
      ALTER TABLE "invoice_lines" ADD "expiry_date" date
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoice_lines" DROP COLUMN "expiry_date"`);
    await queryRunner.query(`ALTER TABLE "invoice_lines" DROP COLUMN "batch_code"`);
  }
}
