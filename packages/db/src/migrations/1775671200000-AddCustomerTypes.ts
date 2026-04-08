import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerTypes1775671200000 implements MigrationInterface {
  name = 'AddCustomerTypes1775671200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "customer_types" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_customer_types_name" UNIQUE ("name"), CONSTRAINT "PK_customer_types_id" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `INSERT INTO "customer_types" ("name") VALUES ('Retailer'), ('Wholesaler'), ('Walk-in')`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "customer_types"`);
  }
}
