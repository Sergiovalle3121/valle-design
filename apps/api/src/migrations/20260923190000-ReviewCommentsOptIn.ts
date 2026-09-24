import { MigrationInterface, QueryRunner } from 'typeorm';

/** Los enlaces existentes conservan su permiso; sólo cambia el valor por defecto. */
export class ReviewCommentsOptIn20260923190000 implements MigrationInterface {
  name = 'ReviewCommentsOptIn20260923190000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;
    await queryRunner.query(
      'ALTER TABLE "cad_review_sessions" ALTER COLUMN "allow_comments" SET DEFAULT false',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;
    await queryRunner.query(
      'ALTER TABLE "cad_review_sessions" ALTER COLUMN "allow_comments" SET DEFAULT true',
    );
  }
}
