import { MigrationInterface, QueryRunner } from 'typeorm';

export class CustomerPharmaAndGeo1750000000000 implements MigrationInterface {
  name = 'CustomerPharmaAndGeo1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "towns" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "branch_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_towns" PRIMARY KEY ("id"),
        CONSTRAINT "FK_towns_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_towns_name_branch_active" ON "towns" (
        LOWER(TRIM("name")),
        COALESCE("branch_id", '00000000-0000-0000-0000-000000000000'::uuid)
      ) WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_towns_branch" ON "towns" ("branch_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "areas" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "town_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_areas" PRIMARY KEY ("id"),
        CONSTRAINT "FK_areas_town" FOREIGN KEY ("town_id") REFERENCES "towns"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_areas_name_town_active" ON "areas" (
        "town_id",
        LOWER(TRIM("name"))
      ) WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_areas_town" ON "areas" ("town_id")
    `);

    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN "long_name" character varying`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN "address" text`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN "town_id" uuid`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN "area_id" uuid`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN "telephone" character varying`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN "mobile" character varying`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN "contact_person" character varying`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN "ntn" character varying`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN "stn" character varying`);
    await queryRunner.query(`
      ALTER TABLE "customers" ADD COLUMN "sales_tax_status" character varying NOT NULL DEFAULT 'unregistered'
    `);
    await queryRunner.query(`
      ALTER TABLE "customers" ADD COLUMN "is_filer" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN "license_no" character varying`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN "license_expiry_date" date`);

    await queryRunner.query(`
      ALTER TABLE "customers" ADD CONSTRAINT "FK_customers_town"
        FOREIGN KEY ("town_id") REFERENCES "towns"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "customers" ADD CONSTRAINT "FK_customers_area"
        FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX "IDX_customers_town" ON "customers" ("town_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_customers_area" ON "customers" ("area_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "customers" DROP CONSTRAINT "FK_customers_area"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP CONSTRAINT "FK_customers_town"`);
    await queryRunner.query(`DROP INDEX "IDX_customers_area"`);
    await queryRunner.query(`DROP INDEX "IDX_customers_town"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "license_expiry_date"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "license_no"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "is_filer"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "sales_tax_status"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "stn"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "ntn"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "contact_person"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "mobile"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "telephone"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "area_id"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "town_id"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "address"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "long_name"`);
    await queryRunner.query(`DROP INDEX "IDX_areas_town"`);
    await queryRunner.query(`DROP INDEX "UQ_areas_name_town_active"`);
    await queryRunner.query(`DROP TABLE "areas"`);
    await queryRunner.query(`DROP INDEX "IDX_towns_branch"`);
    await queryRunner.query(`DROP INDEX "UQ_towns_name_branch_active"`);
    await queryRunner.query(`DROP TABLE "towns"`);
  }
}
