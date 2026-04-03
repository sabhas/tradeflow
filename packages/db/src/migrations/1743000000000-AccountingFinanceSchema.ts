import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountingFinanceSchema1743000000000 implements MigrationInterface {
  name = 'AccountingFinanceSchema1743000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "accounts" ("code", "name", "type", "is_system", "branch_id")
      SELECT '1010', 'Bank', 'asset', true, NULL
      WHERE NOT EXISTS (SELECT 1 FROM "accounts" a WHERE a.code = '1010' AND a.branch_id IS NULL)
    `);
    await queryRunner.query(`
      INSERT INTO "accounts" ("code", "name", "type", "is_system", "branch_id")
      SELECT '3000', 'Retained Earnings', 'equity', true, NULL
      WHERE NOT EXISTS (SELECT 1 FROM "accounts" a WHERE a.code = '3000' AND a.branch_id IS NULL)
    `);
    await queryRunner.query(`
      INSERT INTO "accounts" ("code", "name", "type", "is_system", "branch_id")
      SELECT '5000', 'Purchases', 'expense', true, NULL
      WHERE NOT EXISTS (SELECT 1 FROM "accounts" a WHERE a.code = '5000' AND a.branch_id IS NULL)
    `);

    await queryRunner.query(`
      CREATE TABLE "company_settings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "default_cash_account_id" uuid NOT NULL,
        "default_bank_account_id" uuid NOT NULL,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_company_settings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_company_settings_cash" FOREIGN KEY ("default_cash_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_company_settings_bank" FOREIGN KEY ("default_bank_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      INSERT INTO "company_settings" ("default_cash_account_id", "default_bank_account_id")
      SELECT c.id, b.id
      FROM "accounts" c
      CROSS JOIN "accounts" b
      WHERE c.code = '1000' AND c.branch_id IS NULL AND b.code = '1010' AND b.branch_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM "company_settings")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "company_settings"`);
  }
}
