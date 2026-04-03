import { MigrationInterface, QueryRunner } from 'typeorm';

export class LogisticsDistributionSchema1744000000000 implements MigrationInterface {
  name = 'LogisticsDistributionSchema1744000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "delivery_routes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "code" character varying NOT NULL,
        "description" text,
        "branch_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_delivery_routes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_delivery_routes_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_delivery_routes_code_global" ON "delivery_routes" ("code") WHERE branch_id IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_delivery_routes_code_branch" ON "delivery_routes" ("code", "branch_id") WHERE branch_id IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "customers" ADD COLUMN "default_route_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "customers" ADD CONSTRAINT "FK_customers_default_route"
        FOREIGN KEY ("default_route_id") REFERENCES "delivery_routes"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "route_stops" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "route_id" uuid NOT NULL,
        "sequence_order" integer NOT NULL,
        "customer_id" uuid,
        "address_line" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_route_stops" PRIMARY KEY ("id"),
        CONSTRAINT "FK_route_stops_route" FOREIGN KEY ("route_id") REFERENCES "delivery_routes"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_route_stops_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_route_stops_route_seq" ON "route_stops" ("route_id", "sequence_order")
    `);

    await queryRunner.query(`
      ALTER TABLE "invoices" ADD COLUMN "salesperson_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "invoices" ADD CONSTRAINT "FK_invoices_salesperson"
        FOREIGN KEY ("salesperson_id") REFERENCES "salespersons"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_invoices_salesperson_date" ON "invoices" ("salesperson_id", "invoice_date")
    `);

    await queryRunner.query(`
      ALTER TABLE "sales_orders" ADD COLUMN "salesperson_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "sales_orders" ADD CONSTRAINT "FK_sales_orders_salesperson"
        FOREIGN KEY ("salesperson_id") REFERENCES "salespersons"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "delivery_notes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "invoice_id" uuid,
        "sales_order_id" uuid,
        "delivery_date" date,
        "status" character varying NOT NULL DEFAULT 'pending',
        "warehouse_id" uuid,
        "branch_id" uuid,
        "created_by" uuid,
        "cold_chain_required" boolean NOT NULL DEFAULT false,
        "controlled_delivery_required" boolean NOT NULL DEFAULT false,
        "dispatch_compliance_note" text,
        "delivery_compliance_note" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_delivery_notes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_delivery_notes_invoice" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_delivery_notes_sales_order" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_delivery_notes_warehouse" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_delivery_notes_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_delivery_notes_user" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_delivery_note_source" CHECK (invoice_id IS NOT NULL OR sales_order_id IS NOT NULL)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_delivery_notes_status_date" ON "delivery_notes" ("status", "delivery_date")
    `);

    await queryRunner.query(`
      CREATE TABLE "delivery_note_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "delivery_note_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "quantity" numeric(14,4) NOT NULL,
        "invoice_line_id" uuid,
        "sales_order_line_id" uuid,
        CONSTRAINT "PK_delivery_note_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_delivery_note_lines_note" FOREIGN KEY ("delivery_note_id") REFERENCES "delivery_notes"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_delivery_note_lines_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_delivery_note_lines_invoice_line" FOREIGN KEY ("invoice_line_id") REFERENCES "invoice_lines"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_delivery_note_lines_so_line" FOREIGN KEY ("sales_order_line_id") REFERENCES "sales_order_lines"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "proof_of_delivery" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "delivery_note_id" uuid NOT NULL,
        "type" character varying NOT NULL,
        "reference" text NOT NULL,
        "notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_proof_of_delivery" PRIMARY KEY ("id"),
        CONSTRAINT "FK_proof_of_delivery_note" FOREIGN KEY ("delivery_note_id") REFERENCES "delivery_notes"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "delivery_runs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "run_date" date NOT NULL,
        "route_id" uuid NOT NULL,
        "vehicle_info" character varying,
        "driver_salesperson_id" uuid,
        "status" character varying NOT NULL DEFAULT 'draft',
        "branch_id" uuid,
        "created_by" uuid,
        "cold_chain_required" boolean NOT NULL DEFAULT false,
        "controlled_delivery_required" boolean NOT NULL DEFAULT false,
        "dispatch_compliance_note" text,
        "delivery_compliance_note" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_delivery_runs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_delivery_runs_route" FOREIGN KEY ("route_id") REFERENCES "delivery_routes"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_delivery_runs_driver" FOREIGN KEY ("driver_salesperson_id") REFERENCES "salespersons"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_delivery_runs_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_delivery_runs_user" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_delivery_runs_date_route" ON "delivery_runs" ("run_date", "route_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "delivery_run_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "delivery_run_id" uuid NOT NULL,
        "delivery_note_id" uuid NOT NULL,
        CONSTRAINT "PK_delivery_run_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_delivery_run_items_run" FOREIGN KEY ("delivery_run_id") REFERENCES "delivery_runs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_delivery_run_items_note" FOREIGN KEY ("delivery_note_id") REFERENCES "delivery_notes"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_delivery_run_items_pair" UNIQUE ("delivery_run_id", "delivery_note_id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_delivery_run_items_note" ON "delivery_run_items" ("delivery_note_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_delivery_run_items_note"`);
    await queryRunner.query(`DROP TABLE "delivery_run_items"`);
    await queryRunner.query(`DROP TABLE "delivery_runs"`);
    await queryRunner.query(`DROP TABLE "proof_of_delivery"`);
    await queryRunner.query(`DROP TABLE "delivery_note_lines"`);
    await queryRunner.query(`DROP TABLE "delivery_notes"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP CONSTRAINT "FK_sales_orders_salesperson"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN "salesperson_id"`);
    await queryRunner.query(`DROP INDEX "IDX_invoices_salesperson_date"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP CONSTRAINT "FK_invoices_salesperson"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "salesperson_id"`);
    await queryRunner.query(`DROP TABLE "route_stops"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP CONSTRAINT "FK_customers_default_route"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "default_route_id"`);
    await queryRunner.query(`DROP TABLE "delivery_routes"`);
  }
}
