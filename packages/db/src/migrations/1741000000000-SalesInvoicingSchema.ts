import { MigrationInterface, QueryRunner } from 'typeorm';

export class SalesInvoicingSchema1741000000000 implements MigrationInterface {
  name = 'SalesInvoicingSchema1741000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "type" character varying(32) NOT NULL,
        "parent_id" uuid,
        "is_system" boolean NOT NULL DEFAULT false,
        "branch_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_accounts_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_accounts_code_global" ON "accounts" ("code") WHERE branch_id IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_accounts_code_branch" ON "accounts" ("code", "branch_id") WHERE branch_id IS NOT NULL
    `);

    await queryRunner.query(`
      INSERT INTO "accounts" ("code", "name", "type", "is_system", "branch_id")
      VALUES
        ('1200', 'Accounts Receivable', 'asset', true, NULL),
        ('1000', 'Cash', 'asset', true, NULL),
        ('4000', 'Sales Revenue', 'income', true, NULL),
        ('2200', 'Tax Payable', 'liability', true, NULL)
    `);

    await queryRunner.query(`
      CREATE TABLE "journal_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "entry_date" date NOT NULL,
        "reference" character varying,
        "description" text,
        "status" character varying NOT NULL DEFAULT 'posted',
        "source_type" character varying,
        "source_id" uuid,
        "branch_id" uuid,
        "created_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_journal_entries" PRIMARY KEY ("id"),
        CONSTRAINT "FK_journal_entries_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_journal_entries_user" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_journal_entries_date_branch" ON "journal_entries" ("entry_date", "branch_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_journal_entries_source" ON "journal_entries" ("source_type", "source_id")
      WHERE source_type IS NOT NULL AND source_id IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "journal_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "journal_entry_id" uuid NOT NULL,
        "account_id" uuid NOT NULL,
        "debit" numeric(14,4) NOT NULL DEFAULT 0,
        "credit" numeric(14,4) NOT NULL DEFAULT 0,
        CONSTRAINT "PK_journal_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_journal_lines_entry" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_journal_lines_account" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_journal_lines_account_entry" ON "journal_lines" ("account_id", "journal_entry_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "quotations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customer_id" uuid NOT NULL,
        "quotation_date" date NOT NULL,
        "valid_until" date,
        "status" character varying NOT NULL DEFAULT 'draft',
        "subtotal" numeric(14,4) NOT NULL DEFAULT 0,
        "tax_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "discount_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "total" numeric(14,4) NOT NULL DEFAULT 0,
        "notes" text,
        "branch_id" uuid,
        "created_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_quotations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_quotations_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_quotations_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_quotations_user" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "quotation_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "quotation_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "quantity" numeric(14,4) NOT NULL,
        "unit_price" numeric(14,4) NOT NULL,
        "tax_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "discount_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "tax_profile_id" uuid,
        CONSTRAINT "PK_quotation_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_quotation_lines_quotation" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_quotation_lines_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_quotation_lines_tax" FOREIGN KEY ("tax_profile_id") REFERENCES "tax_profiles"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "sales_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customer_id" uuid NOT NULL,
        "order_date" date NOT NULL,
        "status" character varying NOT NULL DEFAULT 'draft',
        "warehouse_id" uuid,
        "subtotal" numeric(14,4) NOT NULL DEFAULT 0,
        "tax_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "discount_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "total" numeric(14,4) NOT NULL DEFAULT 0,
        "notes" text,
        "branch_id" uuid,
        "created_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sales_orders" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sales_orders_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_sales_orders_warehouse" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_sales_orders_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_sales_orders_user" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "sales_order_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sales_order_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "quantity" numeric(14,4) NOT NULL,
        "unit_price" numeric(14,4) NOT NULL,
        "tax_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "discount_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "delivered_quantity" numeric(14,4) NOT NULL DEFAULT 0,
        "tax_profile_id" uuid,
        CONSTRAINT "PK_sales_order_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sales_order_lines_order" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sales_order_lines_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_sales_order_lines_tax" FOREIGN KEY ("tax_profile_id") REFERENCES "tax_profiles"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "invoices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customer_id" uuid NOT NULL,
        "invoice_date" date NOT NULL,
        "due_date" date NOT NULL,
        "status" character varying NOT NULL DEFAULT 'draft',
        "payment_type" character varying NOT NULL DEFAULT 'credit',
        "warehouse_id" uuid NOT NULL,
        "subtotal" numeric(14,4) NOT NULL DEFAULT 0,
        "tax_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "discount_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "total" numeric(14,4) NOT NULL DEFAULT 0,
        "notes" text,
        "sales_order_id" uuid,
        "branch_id" uuid,
        "created_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invoices" PRIMARY KEY ("id"),
        CONSTRAINT "FK_invoices_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_invoices_warehouse" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_invoices_sales_order" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_invoices_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_invoices_user" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_invoices_customer_status" ON "invoices" ("customer_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_invoices_invoice_date" ON "invoices" ("invoice_date")
    `);

    await queryRunner.query(`
      CREATE TABLE "invoice_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "invoice_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "sales_order_line_id" uuid,
        "quantity" numeric(14,4) NOT NULL,
        "unit_price" numeric(14,4) NOT NULL,
        "tax_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "discount_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "tax_profile_id" uuid,
        CONSTRAINT "PK_invoice_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_invoice_lines_invoice" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_invoice_lines_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_invoice_lines_sales_order_line" FOREIGN KEY ("sales_order_line_id") REFERENCES "sales_order_lines"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_invoice_lines_tax" FOREIGN KEY ("tax_profile_id") REFERENCES "tax_profiles"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "receipts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customer_id" uuid NOT NULL,
        "receipt_date" date NOT NULL,
        "amount" numeric(14,4) NOT NULL,
        "payment_method" character varying NOT NULL,
        "reference" character varying,
        "branch_id" uuid,
        "created_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_receipts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_receipts_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_receipts_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_receipts_user" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_receipts_customer" ON "receipts" ("customer_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "receipt_allocations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "receipt_id" uuid NOT NULL,
        "invoice_id" uuid NOT NULL,
        "amount" numeric(14,4) NOT NULL,
        CONSTRAINT "PK_receipt_allocations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_receipt_allocations_receipt" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_receipt_allocations_invoice" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_receipt_allocations_receipt_invoice" ON "receipt_allocations" ("receipt_id", "invoice_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "receipt_allocations"`);
    await queryRunner.query(`DROP TABLE "receipts"`);
    await queryRunner.query(`DROP TABLE "invoice_lines"`);
    await queryRunner.query(`DROP TABLE "invoices"`);
    await queryRunner.query(`DROP TABLE "sales_order_lines"`);
    await queryRunner.query(`DROP TABLE "sales_orders"`);
    await queryRunner.query(`DROP TABLE "quotation_lines"`);
    await queryRunner.query(`DROP TABLE "quotations"`);
    await queryRunner.query(`DROP TABLE "journal_lines"`);
    await queryRunner.query(`DROP TABLE "journal_entries"`);
    await queryRunner.query(`DROP TABLE "accounts"`);
  }
}
