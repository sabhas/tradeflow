import { MigrationInterface, QueryRunner } from 'typeorm';

const DEFAULT_TEMPLATE_CONFIG = {
  showLogo: true,
  showLegalName: true,
  showTaxNumber: true,
  showPaymentTerms: true,
  showNotes: true,
};

export class SettingsCustomization1746000000000 implements MigrationInterface {
  name = 'SettingsCustomization1746000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "invoice_templates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(128) NOT NULL,
        "config" jsonb NOT NULL DEFAULT '{}',
        "branch_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invoice_templates" PRIMARY KEY ("id"),
        CONSTRAINT "FK_invoice_templates_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `INSERT INTO "invoice_templates" ("name", "config") VALUES ($1, $2::jsonb)`,
      ['Default', JSON.stringify(DEFAULT_TEMPLATE_CONFIG)]
    );

    await queryRunner.query(`
      ALTER TABLE "company_settings"
        ADD "company_name" character varying(255) NOT NULL DEFAULT 'Your company',
        ADD "legal_name" character varying(255),
        ADD "address_line1" character varying(255),
        ADD "address_line2" character varying(255),
        ADD "city" character varying(128),
        ADD "state" character varying(128),
        ADD "postal_code" character varying(32),
        ADD "country" character varying(128),
        ADD "phone" character varying(64),
        ADD "email" character varying(255),
        ADD "tax_registration_number" character varying(128),
        ADD "logo_url" character varying(2048),
        ADD "financial_year_start_month" smallint NOT NULL DEFAULT 1,
        ADD "financial_year_label_override" character varying(64),
        ADD "currency_code" character varying(3) NOT NULL DEFAULT 'USD',
        ADD "money_decimals" smallint NOT NULL DEFAULT 2,
        ADD "quantity_decimals" smallint NOT NULL DEFAULT 2,
        ADD "rounding_mode" character varying(32) NOT NULL DEFAULT 'half_up',
        ADD "default_invoice_template_id" uuid
    `);

    await queryRunner.query(`
      UPDATE "company_settings" cs
      SET "default_invoice_template_id" = it.id
      FROM "invoice_templates" it
      WHERE it.name = 'Default'
        AND cs.default_invoice_template_id IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "company_settings"
        ADD CONSTRAINT "FK_company_settings_default_invoice_template"
        FOREIGN KEY ("default_invoice_template_id") REFERENCES "invoice_templates"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "invoices"
        ADD "invoice_template_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "invoices"
        ADD CONSTRAINT "FK_invoices_invoice_template"
        FOREIGN KEY ("invoice_template_id") REFERENCES "invoice_templates"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoices" DROP CONSTRAINT "FK_invoices_invoice_template"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "invoice_template_id"`);
    await queryRunner.query(
      `ALTER TABLE "company_settings" DROP CONSTRAINT "FK_company_settings_default_invoice_template"`
    );
    await queryRunner.query(`ALTER TABLE "company_settings" DROP COLUMN "company_name"`);
    await queryRunner.query(`ALTER TABLE "company_settings" DROP COLUMN "legal_name"`);
    await queryRunner.query(`ALTER TABLE "company_settings" DROP COLUMN "address_line1"`);
    await queryRunner.query(`ALTER TABLE "company_settings" DROP COLUMN "address_line2"`);
    await queryRunner.query(`ALTER TABLE "company_settings" DROP COLUMN "city"`);
    await queryRunner.query(`ALTER TABLE "company_settings" DROP COLUMN "state"`);
    await queryRunner.query(`ALTER TABLE "company_settings" DROP COLUMN "postal_code"`);
    await queryRunner.query(`ALTER TABLE "company_settings" DROP COLUMN "country"`);
    await queryRunner.query(`ALTER TABLE "company_settings" DROP COLUMN "phone"`);
    await queryRunner.query(`ALTER TABLE "company_settings" DROP COLUMN "email"`);
    await queryRunner.query(`ALTER TABLE "company_settings" DROP COLUMN "tax_registration_number"`);
    await queryRunner.query(`ALTER TABLE "company_settings" DROP COLUMN "logo_url"`);
    await queryRunner.query(`ALTER TABLE "company_settings" DROP COLUMN "financial_year_start_month"`);
    await queryRunner.query(`ALTER TABLE "company_settings" DROP COLUMN "financial_year_label_override"`);
    await queryRunner.query(`ALTER TABLE "company_settings" DROP COLUMN "currency_code"`);
    await queryRunner.query(`ALTER TABLE "company_settings" DROP COLUMN "money_decimals"`);
    await queryRunner.query(`ALTER TABLE "company_settings" DROP COLUMN "quantity_decimals"`);
    await queryRunner.query(`ALTER TABLE "company_settings" DROP COLUMN "rounding_mode"`);
    await queryRunner.query(`ALTER TABLE "company_settings" DROP COLUMN "default_invoice_template_id"`);
    await queryRunner.query(`DROP TABLE "invoice_templates"`);
  }
}
