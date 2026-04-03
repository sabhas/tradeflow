import { MigrationInterface, QueryRunner } from 'typeorm';

export class OpsPhase21748000000000 implements MigrationInterface {
  name = 'OpsPhase21748000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "accounts" ("code", "name", "type", "is_system", "branch_id")
      SELECT '5100', 'Cost of Goods Sold', 'expense', true, NULL
      WHERE NOT EXISTS (SELECT 1 FROM "accounts" a WHERE a.code = '5100' AND a.branch_id IS NULL)
    `);

    await queryRunner.query(
      `ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "period_locked_through" date`
    );
    await queryRunner.query(
      `ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "journal_approval_threshold" numeric(14,4)`
    );

    await queryRunner.query(`
      CREATE TABLE "user_branches" (
        "user_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL,
        "is_default" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_user_branches" PRIMARY KEY ("user_id", "branch_id"),
        CONSTRAINT "FK_user_branches_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_branches_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE
      )
    `);

    // users.branch_id is varchar (InitialSchema); user_branches.branch_id is uuid — cast for compare/insert.
    await queryRunner.query(`
      INSERT INTO "user_branches" ("user_id", "branch_id", "is_default")
      SELECT u.id, u.branch_id::uuid, true
      FROM "users" u
      WHERE u.branch_id IS NOT NULL
        AND trim(u.branch_id) <> ''
        AND u.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "user_branches" ub
          WHERE ub.user_id = u.id AND ub.branch_id = u.branch_id::uuid
        )
    `);

    await queryRunner.query(`
      CREATE TABLE "approval_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "entity_type" character varying(64) NOT NULL,
        "entity_id" uuid NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'pending',
        "requested_by" uuid,
        "reviewed_by" uuid,
        "review_note" text,
        "branch_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "reviewed_at" TIMESTAMP,
        CONSTRAINT "PK_approval_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_approval_req_by" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_approval_rev_by" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_approval_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_approval_status" ON "approval_requests" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "user_notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" character varying(64) NOT NULL,
        "title" character varying(255) NOT NULL,
        "body" text,
        "read_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_notif_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_user_notif_user" ON "user_notifications" ("user_id", "created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_notifications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "approval_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_branches"`);
    await queryRunner.query(
      `ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "journal_approval_threshold", DROP COLUMN IF EXISTS "period_locked_through"`
    );
  }
}
