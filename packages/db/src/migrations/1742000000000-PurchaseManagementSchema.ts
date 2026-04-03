import { MigrationInterface, QueryRunner } from 'typeorm';

export class PurchaseManagementSchema1742000000000 implements MigrationInterface {
  name = 'PurchaseManagementSchema1742000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "accounts" ("code", "name", "type", "is_system", "branch_id")
      SELECT '1300', 'Inventory', 'asset', true, NULL
      WHERE NOT EXISTS (SELECT 1 FROM "accounts" a WHERE a.code = '1300' AND a.branch_id IS NULL)
    `);
    await queryRunner.query(`
      INSERT INTO "accounts" ("code", "name", "type", "is_system", "branch_id")
      SELECT '2100', 'Accounts Payable', 'liability', true, NULL
      WHERE NOT EXISTS (SELECT 1 FROM "accounts" a WHERE a.code = '2100' AND a.branch_id IS NULL)
    `);
    await queryRunner.query(`
      INSERT INTO "accounts" ("code", "name", "type", "is_system", "branch_id")
      SELECT '1500', 'Input VAT Recoverable', 'asset', true, NULL
      WHERE NOT EXISTS (SELECT 1 FROM "accounts" a WHERE a.code = '1500' AND a.branch_id IS NULL)
    `);

    await queryRunner.query(`
      CREATE TABLE "purchase_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "supplier_id" uuid NOT NULL,
        "order_date" date NOT NULL,
        "expected_date" date,
        "status" character varying NOT NULL DEFAULT 'draft',
        "warehouse_id" uuid NOT NULL,
        "subtotal" numeric(14,4) NOT NULL DEFAULT 0,
        "tax_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "discount_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "total" numeric(14,4) NOT NULL DEFAULT 0,
        "notes" text,
        "branch_id" uuid,
        "created_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_purchase_orders" PRIMARY KEY ("id"),
        CONSTRAINT "FK_po_supplier" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_po_warehouse" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_po_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_po_user" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_purchase_orders_supplier" ON "purchase_orders" ("supplier_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_purchase_orders_branch_date" ON "purchase_orders" ("branch_id", "order_date")`);

    await queryRunner.query(`
      CREATE TABLE "purchase_order_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "purchase_order_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "quantity" numeric(14,4) NOT NULL,
        "unit_price" numeric(14,4) NOT NULL,
        "tax_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "discount_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "received_quantity" numeric(14,4) NOT NULL DEFAULT 0,
        "tax_profile_id" uuid,
        CONSTRAINT "PK_purchase_order_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pol_po" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pol_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_pol_tax" FOREIGN KEY ("tax_profile_id") REFERENCES "tax_profiles"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_pol_po" ON "purchase_order_lines" ("purchase_order_id")`);

    await queryRunner.query(`
      CREATE TABLE "grns" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "purchase_order_id" uuid,
        "supplier_id" uuid NOT NULL,
        "grn_date" date NOT NULL,
        "warehouse_id" uuid NOT NULL,
        "status" character varying NOT NULL DEFAULT 'draft',
        "branch_id" uuid,
        "created_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_grns" PRIMARY KEY ("id"),
        CONSTRAINT "FK_grn_po" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_grn_supplier" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_grn_warehouse" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_grn_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_grn_user" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_grns_po" ON "grns" ("purchase_order_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_grns_supplier_date" ON "grns" ("supplier_id", "grn_date")`);

    await queryRunner.query(`
      CREATE TABLE "grn_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "grn_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "quantity" numeric(14,4) NOT NULL,
        "unit_price" numeric(14,4) NOT NULL DEFAULT 0,
        "purchase_order_line_id" uuid,
        CONSTRAINT "PK_grn_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_gl_grn" FOREIGN KEY ("grn_id") REFERENCES "grns"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_gl_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_gl_pol" FOREIGN KEY ("purchase_order_line_id") REFERENCES "purchase_order_lines"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_grn_lines_grn" ON "grn_lines" ("grn_id")`);

    await queryRunner.query(`
      ALTER TABLE "inventory_movements"
      ADD COLUMN "grn_line_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_movements"
      ADD CONSTRAINT "FK_inv_mov_grn_line" FOREIGN KEY ("grn_line_id") REFERENCES "grn_lines"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "supplier_invoices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "supplier_id" uuid NOT NULL,
        "invoice_number" character varying NOT NULL,
        "invoice_date" date NOT NULL,
        "due_date" date NOT NULL,
        "purchase_order_id" uuid,
        "grn_id" uuid,
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
        CONSTRAINT "PK_supplier_invoices" PRIMARY KEY ("id"),
        CONSTRAINT "FK_si_supplier" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_si_po" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_si_grn" FOREIGN KEY ("grn_id") REFERENCES "grns"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_si_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_si_user" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_supplier_invoices_supplier" ON "supplier_invoices" ("supplier_id")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_supplier_invoice_number" ON "supplier_invoices" ("supplier_id", "invoice_number")`
    );

    await queryRunner.query(`
      CREATE TABLE "supplier_invoice_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "supplier_invoice_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "quantity" numeric(14,4) NOT NULL,
        "unit_price" numeric(14,4) NOT NULL,
        "tax_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "discount_amount" numeric(14,4) NOT NULL DEFAULT 0,
        "grn_line_id" uuid,
        "tax_profile_id" uuid,
        CONSTRAINT "PK_supplier_invoice_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sil_si" FOREIGN KEY ("supplier_invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sil_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_sil_grn_line" FOREIGN KEY ("grn_line_id") REFERENCES "grn_lines"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_sil_tax" FOREIGN KEY ("tax_profile_id") REFERENCES "tax_profiles"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_sil_invoice" ON "supplier_invoice_lines" ("supplier_invoice_id")`);

    await queryRunner.query(`
      CREATE TABLE "supplier_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "supplier_id" uuid NOT NULL,
        "payment_date" date NOT NULL,
        "amount" numeric(14,4) NOT NULL,
        "payment_method" character varying NOT NULL,
        "reference" character varying,
        "branch_id" uuid,
        "created_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_supplier_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sp_supplier" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_sp_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_sp_user" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_supplier_payments_supplier" ON "supplier_payments" ("supplier_id")`);

    await queryRunner.query(`
      CREATE TABLE "supplier_payment_allocations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "supplier_payment_id" uuid NOT NULL,
        "supplier_invoice_id" uuid NOT NULL,
        "amount" numeric(14,4) NOT NULL,
        CONSTRAINT "PK_supplier_payment_allocations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_spa_payment" FOREIGN KEY ("supplier_payment_id") REFERENCES "supplier_payments"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_spa_invoice" FOREIGN KEY ("supplier_invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_spa_payment" ON "supplier_payment_allocations" ("supplier_payment_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_spa_invoice" ON "supplier_payment_allocations" ("supplier_invoice_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "supplier_payment_allocations"`);
    await queryRunner.query(`DROP TABLE "supplier_payments"`);
    await queryRunner.query(`DROP TABLE "supplier_invoice_lines"`);
    await queryRunner.query(`DROP TABLE "supplier_invoices"`);
    await queryRunner.query(`ALTER TABLE "inventory_movements" DROP CONSTRAINT "FK_inv_mov_grn_line"`);
    await queryRunner.query(`ALTER TABLE "inventory_movements" DROP COLUMN "grn_line_id"`);
    await queryRunner.query(`DROP TABLE "grn_lines"`);
    await queryRunner.query(`DROP TABLE "grns"`);
    await queryRunner.query(`DROP TABLE "purchase_order_lines"`);
    await queryRunner.query(`DROP TABLE "purchase_orders"`);
  }
}
