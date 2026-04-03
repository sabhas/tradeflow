import { MigrationInterface, QueryRunner } from 'typeorm';

export class InvoiceJournalSoftDelete1745000000000 implements MigrationInterface {
  name = 'InvoiceJournalSoftDelete1745000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoices" ADD "deleted_at" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "journal_entries" ADD "deleted_at" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "journal_entries" DROP COLUMN "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "deleted_at"`);
  }
}
