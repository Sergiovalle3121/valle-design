import { MigrationInterface, QueryRunner } from 'typeorm';

/** F2: referencia inmutable a la versión CAS y fecha server-owned de entrega. */
export class FrozenCadReviewDelivery20260923180000 implements MigrationInterface {
  name = 'FrozenCadReviewDelivery20260923180000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const timestamp =
      queryRunner.connection.options.type === 'postgres'
        ? 'TIMESTAMP'
        : 'datetime';
    if (
      !(await queryRunner.hasColumn('cad_review_sessions', 'delivered_version'))
    ) {
      await queryRunner.query(
        'ALTER TABLE "cad_review_sessions" ADD COLUMN "delivered_version" integer NULL',
      );
    }
    if (!(await queryRunner.hasColumn('cad_review_sessions', 'delivered_at'))) {
      await queryRunner.query(
        `ALTER TABLE "cad_review_sessions" ADD COLUMN "delivered_at" ${timestamp} NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "cad_review_sessions" DROP COLUMN IF EXISTS "delivered_at"',
    );
    await queryRunner.query(
      'ALTER TABLE "cad_review_sessions" DROP COLUMN IF EXISTS "delivered_version"',
    );
  }
}
