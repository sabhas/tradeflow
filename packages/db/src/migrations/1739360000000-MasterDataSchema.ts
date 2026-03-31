import { MigrationInterface, QueryRunner } from 'typeorm';

export class MasterDataSchema1739360000000 implements MigrationInterface {
  name = 'MasterDataSchema1739360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "branches" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "code" character varying NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_branches_code" UNIQUE ("code"),
        CONSTRAINT "PK_branches" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "payment_terms" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "net_days" integer NOT NULL DEFAULT 0,
        "branch_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_terms" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payment_terms_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tax_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "rate" numeric(7,4) NOT NULL DEFAULT 0,
        "is_inclusive" boolean NOT NULL DEFAULT false,
        "region" character varying,
        "branch_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tax_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tax_profiles_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "parent_id" uuid,
        "name" character varying NOT NULL,
        "code" character varying NOT NULL,
        "branch_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_product_categories" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_categories_parent" FOREIGN KEY ("parent_id") REFERENCES "product_categories"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_product_categories_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_categories_parent" ON "product_categories" ("parent_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_product_categories_branch" ON "product_categories" ("branch_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "units_of_measure" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "branch_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_units_of_measure" PRIMARY KEY ("id"),
        CONSTRAINT "FK_units_of_measure_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "price_levels" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "branch_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_price_levels" PRIMARY KEY ("id"),
        CONSTRAINT "FK_price_levels_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "category_id" uuid NOT NULL,
        "sku" character varying NOT NULL,
        "barcode" character varying,
        "name" character varying NOT NULL,
        "unit_id" uuid NOT NULL,
        "cost_price" numeric(14,4) NOT NULL DEFAULT 0,
        "selling_price" numeric(14,4) NOT NULL DEFAULT 0,
        "batch_tracked" boolean NOT NULL DEFAULT false,
        "expiry_tracked" boolean NOT NULL DEFAULT false,
        "min_stock" numeric(14,4),
        "reorder_level" numeric(14,4),
        "branch_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_products" PRIMARY KEY ("id"),
        CONSTRAINT "FK_products_category" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id"),
        CONSTRAINT "FK_products_unit" FOREIGN KEY ("unit_id") REFERENCES "units_of_measure"("id"),
        CONSTRAINT "FK_products_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_products_category" ON "products" ("category_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_products_unit" ON "products" ("unit_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_products_branch" ON "products" ("branch_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_products_name" ON "products" ("name")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_products_sku_branch_active" ON "products" (
        LOWER(TRIM("sku")),
        COALESCE("branch_id", '00000000-0000-0000-0000-000000000000'::uuid)
      ) WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_products_barcode_branch_active" ON "products" (
        LOWER(TRIM("barcode")),
        COALESCE("branch_id", '00000000-0000-0000-0000-000000000000'::uuid)
      ) WHERE "deleted_at" IS NULL AND "barcode" IS NOT NULL AND TRIM("barcode") <> ''
    `);

    await queryRunner.query(`
      CREATE TABLE "product_prices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "price_level_id" uuid NOT NULL,
        "price" numeric(14,4) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_prices" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_prices_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_prices_price_level" FOREIGN KEY ("price_level_id") REFERENCES "price_levels"("id"),
        CONSTRAINT "UQ_product_prices_product_level" UNIQUE ("product_id", "price_level_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "customers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "type" character varying NOT NULL,
        "contact" jsonb,
        "credit_limit" numeric(14,4) NOT NULL DEFAULT 0,
        "payment_terms_id" uuid,
        "tax_profile_id" uuid,
        "branch_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_customers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_customers_payment_terms" FOREIGN KEY ("payment_terms_id") REFERENCES "payment_terms"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_customers_tax_profile" FOREIGN KEY ("tax_profile_id") REFERENCES "tax_profiles"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_customers_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_customers_branch" ON "customers" ("branch_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_customers_name" ON "customers" ("name")
    `);

    await queryRunner.query(`
      CREATE TABLE "suppliers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "contact" jsonb,
        "payment_terms_id" uuid,
        "tax_profile_id" uuid,
        "branch_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_suppliers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_suppliers_payment_terms" FOREIGN KEY ("payment_terms_id") REFERENCES "payment_terms"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_suppliers_tax_profile" FOREIGN KEY ("tax_profile_id") REFERENCES "tax_profiles"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_suppliers_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_suppliers_branch" ON "suppliers" ("branch_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "warehouses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "code" character varying NOT NULL,
        "branch_id" uuid,
        "is_default" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_warehouses" PRIMARY KEY ("id"),
        CONSTRAINT "FK_warehouses_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "salespersons" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "code" character varying NOT NULL,
        "branch_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_salespersons" PRIMARY KEY ("id"),
        CONSTRAINT "FK_salespersons_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "salespersons"`);
    await queryRunner.query(`DROP TABLE "warehouses"`);
    await queryRunner.query(`DROP TABLE "suppliers"`);
    await queryRunner.query(`DROP TABLE "customers"`);
    await queryRunner.query(`DROP TABLE "product_prices"`);
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP TABLE "price_levels"`);
    await queryRunner.query(`DROP TABLE "units_of_measure"`);
    await queryRunner.query(`DROP TABLE "product_categories"`);
    await queryRunner.query(`DROP TABLE "tax_profiles"`);
    await queryRunner.query(`DROP TABLE "payment_terms"`);
    await queryRunner.query(`DROP TABLE "branches"`);
  }
}
