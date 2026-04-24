import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropProductCutPrice1777200000000 implements MigrationInterface {
  name = 'DropProductCutPrice1777200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "cut_price"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN "cut_price" numeric(14,4) NOT NULL DEFAULT '0'`
    );
  }
}
