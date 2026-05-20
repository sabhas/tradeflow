import { MigrationInterface, QueryRunner } from 'typeorm';

export class SaleCreditNotesAndPurchaseReturns1777400000000 implements MigrationInterface {
  name = 'SaleCreditNotesAndPurchaseReturns1777400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices" ADD "document_kind" character varying NOT NULL DEFAULT 'invoice'
    `);
    await queryRunner.query(`
      ALTER TABLE "invoices" ADD "original_invoice_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "invoices"
      ADD CONSTRAINT "FK_invoices_original_invoice"
      FOREIGN KEY ("original_invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`CREATE INDEX "IDX_invoices_document_kind" ON "invoices" ("document_kind")`);

    await queryRunner.query(`
      ALTER TABLE "invoice_lines" ADD "original_invoice_line_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "invoice_lines"
      ADD CONSTRAINT "FK_invoice_lines_original_invoice_line"
      FOREIGN KEY ("original_invoice_line_id") REFERENCES "invoice_lines"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "purchase_returns" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "supplier_id" uuid NOT NULL,
        "return_date" date NOT NULL,
        "warehouse_id" uuid NOT NULL,
        "status" character varying NOT NULL DEFAULT 'draft',
        "subtotal" numeric(14,4) NOT NULL DEFAULT 0,
        "tax_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "discount_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "total" numeric(14,4) NOT NULL DEFAULT 0,
        "notes" text,
        "grn_id" uuid,
        "created_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_purchase_returns" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_purchase_returns_supplier" ON "purchase_returns" ("supplier_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "purchase_returns"
      ADD CONSTRAINT "FK_purchase_returns_supplier"
      FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "purchase_returns"
      ADD CONSTRAINT "FK_purchase_returns_warehouse"
      FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "purchase_returns"
      ADD CONSTRAINT "FK_purchase_returns_grn"
      FOREIGN KEY ("grn_id") REFERENCES "grns"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "purchase_returns"
      ADD CONSTRAINT "FK_purchase_returns_created_by"
      FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "purchase_return_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "purchase_return_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "quantity" numeric(14,4) NOT NULL,
        "unit_price" numeric(14,4) NOT NULL,
        "tax_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "discount_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "tax_profile_id" uuid,
        "grn_line_id" uuid,
        CONSTRAINT "PK_purchase_return_lines" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "purchase_return_lines"
      ADD CONSTRAINT "FK_prl_return"
      FOREIGN KEY ("purchase_return_id") REFERENCES "purchase_returns"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "purchase_return_lines"
      ADD CONSTRAINT "FK_prl_product"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "purchase_return_lines"
      ADD CONSTRAINT "FK_prl_tax_profile"
      FOREIGN KEY ("tax_profile_id") REFERENCES "tax_profiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "purchase_return_lines"
      ADD CONSTRAINT "FK_prl_grn_line"
      FOREIGN KEY ("grn_line_id") REFERENCES "grn_lines"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "purchase_return_lines"`);
    await queryRunner.query(`DROP TABLE "purchase_returns"`);
    await queryRunner.query(`ALTER TABLE "invoice_lines" DROP CONSTRAINT "FK_invoice_lines_original_invoice_line"`);
    await queryRunner.query(`ALTER TABLE "invoice_lines" DROP COLUMN "original_invoice_line_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_invoices_document_kind"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP CONSTRAINT "FK_invoices_original_invoice"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "original_invoice_id"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "document_kind"`);
  }
}
