import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSupplierProfileFields1775693400000 implements MigrationInterface {
  name = 'AddSupplierProfileFields1775693400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "suppliers" ADD "address" character varying`);
    await queryRunner.query(`ALTER TABLE "suppliers" ADD "city" character varying`);
    await queryRunner.query(`ALTER TABLE "suppliers" ADD "telephone" character varying`);
    await queryRunner.query(`ALTER TABLE "suppliers" ADD "mobile_no" character varying`);
    await queryRunner.query(`ALTER TABLE "suppliers" ADD "email" character varying`);
    await queryRunner.query(`ALTER TABLE "suppliers" ADD "website" character varying`);
    await queryRunner.query(`ALTER TABLE "suppliers" ADD "contact_person" character varying`);
    await queryRunner.query(`ALTER TABLE "suppliers" ADD "ntn" character varying`);
    await queryRunner.query(`ALTER TABLE "suppliers" ADD "stn" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN "stn"`);
    await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN "ntn"`);
    await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN "contact_person"`);
    await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN "website"`);
    await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN "email"`);
    await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN "mobile_no"`);
    await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN "telephone"`);
    await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN "city"`);
    await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN "address"`);
  }
}
