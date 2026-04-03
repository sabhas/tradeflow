import { MigrationInterface, QueryRunner } from 'typeorm';

export class InventorySchema1740000000000 implements MigrationInterface {
  name = 'InventorySchema1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "inventory_movements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "warehouse_id" uuid NOT NULL,
        "quantity_delta" numeric(14,4) NOT NULL,
        "ref_type" character varying NOT NULL,
        "ref_id" uuid,
        "unit_cost" numeric(14,4),
        "movement_date" date NOT NULL,
        "branch_id" uuid,
        "notes" text,
        "user_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inventory_movements" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inventory_movements_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_inventory_movements_warehouse" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_inventory_movements_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_inventory_movements_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_movements_product_wh_date"
      ON "inventory_movements" ("product_id", "warehouse_id", "movement_date")
    `);

    await queryRunner.query(`
      CREATE TABLE "stock_balances" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "warehouse_id" uuid NOT NULL,
        "quantity" numeric(14,4) NOT NULL DEFAULT 0,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_balances" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_stock_balances_product_warehouse" UNIQUE ("product_id", "warehouse_id"),
        CONSTRAINT "FK_stock_balances_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_balances_warehouse" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_stock_balances_product_warehouse" ON "stock_balances" ("product_id", "warehouse_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "stock_balances"`);
    await queryRunner.query(`DROP TABLE "inventory_movements"`);
  }
}
