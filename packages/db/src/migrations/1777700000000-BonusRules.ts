import { MigrationInterface, QueryRunner } from 'typeorm';

export class BonusRules1777700000000 implements MigrationInterface {
  name = 'BonusRules1777700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "bonus_rules" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "min_quantity" numeric(14,4) NOT NULL,
        "bonus_quantity" numeric(14,4) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bonus_rules" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bonus_rules_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_bonus_rules_product_id" ON "bonus_rules" ("product_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "invoice_lines" ADD "bonus_quantity" numeric(14,4) NOT NULL DEFAULT '0'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoice_lines" DROP COLUMN "bonus_quantity"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_bonus_rules_product_id"`);
    await queryRunner.query(`DROP TABLE "bonus_rules"`);
  }
}
