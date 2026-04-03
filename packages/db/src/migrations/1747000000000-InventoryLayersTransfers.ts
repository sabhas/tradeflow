import { MigrationInterface, QueryRunner } from 'typeorm';

export class InventoryLayersTransfers1747000000000 implements MigrationInterface {
  name = 'InventoryLayersTransfers1747000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "stock_layers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "warehouse_id" uuid NOT NULL,
        "quantity_remaining" numeric(14,4) NOT NULL,
        "unit_cost" numeric(14,4) NOT NULL,
        "batch_code" character varying(128),
        "expiry_date" date,
        "received_at" TIMESTAMP NOT NULL DEFAULT now(),
        "source_ref_type" character varying(32) NOT NULL,
        "source_ref_id" uuid,
        "grn_line_id" uuid,
        "branch_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_layers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_stock_layers_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_layers_warehouse" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_layers_grn_line" FOREIGN KEY ("grn_line_id") REFERENCES "grn_lines"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_stock_layers_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_stock_layers_product_wh" ON "stock_layers" ("product_id", "warehouse_id")`);

    await queryRunner.query(`
      CREATE TABLE "stock_transfers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "from_warehouse_id" uuid NOT NULL,
        "to_warehouse_id" uuid NOT NULL,
        "transfer_date" date NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'draft',
        "notes" text,
        "branch_id" uuid,
        "created_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_transfers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_stock_transfers_from_wh" FOREIGN KEY ("from_warehouse_id") REFERENCES "warehouses"("id"),
        CONSTRAINT "FK_stock_transfers_to_wh" FOREIGN KEY ("to_warehouse_id") REFERENCES "warehouses"("id"),
        CONSTRAINT "FK_stock_transfers_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_stock_transfers_user" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "stock_transfer_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transfer_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "quantity" numeric(14,4) NOT NULL,
        CONSTRAINT "PK_stock_transfer_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_stl_transfer" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stl_product" FOREIGN KEY ("product_id") REFERENCES "products"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_stl_transfer" ON "stock_transfer_lines" ("transfer_id")`);

    await queryRunner.query(`
      CREATE TABLE "inventory_layer_consumptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "inventory_movement_id" uuid NOT NULL,
        "stock_layer_id" uuid NOT NULL,
        "quantity" numeric(14,4) NOT NULL,
        "unit_cost" numeric(14,4) NOT NULL,
        CONSTRAINT "PK_inventory_layer_consumptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ilc_movement" FOREIGN KEY ("inventory_movement_id") REFERENCES "inventory_movements"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ilc_layer" FOREIGN KEY ("stock_layer_id") REFERENCES "stock_layers"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ilc_movement" ON "inventory_layer_consumptions" ("inventory_movement_id")`
    );

    await queryRunner.query(
      `ALTER TABLE "company_settings" ADD "inventory_costing_method" character varying(8) NOT NULL DEFAULT 'fifo'`
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD "costing_method" character varying(8)`
    );

    await queryRunner.query(`ALTER TABLE "grn_lines" ADD "batch_code" character varying(128)`);
    await queryRunner.query(`ALTER TABLE "grn_lines" ADD "expiry_date" date`);

    await queryRunner.query(
      `ALTER TABLE "inventory_movements" ADD "invoice_line_id" uuid`
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_movements" ADD "stock_transfer_line_id" uuid`
    );
    await queryRunner.query(`
      ALTER TABLE "inventory_movements"
      ADD CONSTRAINT "FK_inv_mov_invoice_line" FOREIGN KEY ("invoice_line_id") REFERENCES "invoice_lines"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_movements"
      ADD CONSTRAINT "FK_inv_mov_st_line" FOREIGN KEY ("stock_transfer_line_id") REFERENCES "stock_transfer_lines"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      INSERT INTO "stock_layers" (
        "product_id", "warehouse_id", "quantity_remaining", "unit_cost",
        "batch_code", "expiry_date", "received_at", "source_ref_type", "branch_id"
      )
      SELECT
        sb.product_id,
        sb.warehouse_id,
        sb.quantity,
        COALESCE(NULLIF(TRIM(p.cost_price::text), ''), '0')::numeric(14,4),
        NULL,
        NULL,
        now(),
        'opening_balance',
        p.branch_id
      FROM stock_balances sb
      INNER JOIN products p ON p.id = sb.product_id AND p.deleted_at IS NULL
      WHERE sb.quantity::numeric > 0.00005
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "FK_inv_mov_st_line"`);
    await queryRunner.query(`ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "FK_inv_mov_invoice_line"`);
    await queryRunner.query(`ALTER TABLE "inventory_movements" DROP COLUMN IF EXISTS "stock_transfer_line_id"`);
    await queryRunner.query(`ALTER TABLE "inventory_movements" DROP COLUMN IF EXISTS "invoice_line_id"`);
    await queryRunner.query(`ALTER TABLE "grn_lines" DROP COLUMN IF EXISTS "expiry_date"`);
    await queryRunner.query(`ALTER TABLE "grn_lines" DROP COLUMN IF EXISTS "batch_code"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "costing_method"`);
    await queryRunner.query(`ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "inventory_costing_method"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_layer_consumptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_transfer_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_transfers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_layers"`);
  }
}
