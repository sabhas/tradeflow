import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveSupplierPaymentTermsAndTaxProfile1775693500000 implements MigrationInterface {
  name = 'RemoveSupplierPaymentTermsAndTaxProfile1775693500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "suppliers" DROP CONSTRAINT "FK_c1e2c406478c2355715918d74aa"`);
    await queryRunner.query(`ALTER TABLE "suppliers" DROP CONSTRAINT "FK_80b027cb6dab43b6aa202017ae4"`);
    await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN "payment_terms_id"`);
    await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN "tax_profile_id"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "suppliers" ADD "payment_terms_id" uuid`);
    await queryRunner.query(`ALTER TABLE "suppliers" ADD "tax_profile_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD CONSTRAINT "FK_c1e2c406478c2355715918d74aa" FOREIGN KEY ("payment_terms_id") REFERENCES "payment_terms"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD CONSTRAINT "FK_80b027cb6dab43b6aa202017ae4" FOREIGN KEY ("tax_profile_id") REFERENCES "tax_profiles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
  }
}
