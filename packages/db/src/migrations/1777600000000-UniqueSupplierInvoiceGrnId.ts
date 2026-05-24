import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UniqueSupplierInvoiceGrnId1777600000000 implements MigrationInterface {
  name = 'UniqueSupplierInvoiceGrnId1777600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_supplier_invoices_grn_id"
      ON "supplier_invoices" ("grn_id")
      WHERE "grn_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_supplier_invoices_grn_id"`);
  }
}
