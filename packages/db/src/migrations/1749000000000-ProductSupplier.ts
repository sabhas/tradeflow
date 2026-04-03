import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductSupplier1749000000000 implements MigrationInterface {
  name = 'ProductSupplier1749000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN "supplier_id" uuid NOT NULL,
      ADD CONSTRAINT "FK_products_supplier" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`CREATE INDEX "IDX_products_supplier" ON "products" ("supplier_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_supplier"`);
    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "FK_products_supplier"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "supplier_id"`);
  }
}
