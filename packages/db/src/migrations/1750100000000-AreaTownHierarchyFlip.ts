import { MigrationInterface, QueryRunner } from 'typeorm';

export class AreaTownHierarchyFlip1750100000000 implements MigrationInterface {
  name = 'AreaTownHierarchyFlip1750100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "towns" ADD COLUMN "area_id" uuid`);
    await queryRunner.query(`
      ALTER TABLE "towns" ADD CONSTRAINT "FK_towns_area"
        FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`CREATE INDEX "IDX_towns_area" ON "towns" ("area_id")`);

    // Best-effort backfill from legacy shape (areas.town_id -> towns.id).
    await queryRunner.query(`
      UPDATE "towns" t
      SET "area_id" = x.area_id
      FROM (
        SELECT DISTINCT ON (a.town_id) a.town_id, a.id AS area_id
        FROM "areas" a
        WHERE a.deleted_at IS NULL
        ORDER BY a.town_id, a.created_at ASC
      ) x
      WHERE t.id = x.town_id AND t.area_id IS NULL
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_areas_name_town_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_areas_town"`);
    await queryRunner.query(`ALTER TABLE "areas" DROP CONSTRAINT IF EXISTS "FK_areas_town"`);
    await queryRunner.query(`ALTER TABLE "areas" DROP COLUMN IF EXISTS "town_id"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_areas_name_active" ON "areas" (LOWER(TRIM("name")))
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_areas_name_active"`);
    await queryRunner.query(`ALTER TABLE "areas" ADD COLUMN "town_id" uuid`);
    await queryRunner.query(`
      ALTER TABLE "areas" ADD CONSTRAINT "FK_areas_town"
        FOREIGN KEY ("town_id") REFERENCES "towns"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`CREATE INDEX "IDX_areas_town" ON "areas" ("town_id")`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_areas_name_town_active" ON "areas" ("town_id", LOWER(TRIM("name")))
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_towns_area"`);
    await queryRunner.query(`ALTER TABLE "towns" DROP CONSTRAINT IF EXISTS "FK_towns_area"`);
    await queryRunner.query(`ALTER TABLE "towns" DROP COLUMN IF EXISTS "area_id"`);
  }
}

