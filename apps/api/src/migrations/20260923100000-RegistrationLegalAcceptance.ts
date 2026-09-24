import { MigrationInterface, QueryRunner } from 'typeorm';

/** Alta sin organización: constancia histórica separada del ámbito tenant. */
export class RegistrationLegalAcceptance20260923100000 implements MigrationInterface {
  name = 'RegistrationLegalAcceptance20260923100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const postgres = queryRunner.connection.options.type === 'postgres';
    await queryRunner.query(`
      CREATE TABLE "identity_registration_legal_acceptances" (
        "user_id" ${postgres ? 'uuid' : 'varchar(36)'} PRIMARY KEY,
        "terms_version" varchar(40) NOT NULL,
        "accepted_at" ${postgres ? 'timestamptz' : 'datetime'} NOT NULL DEFAULT ${postgres ? 'now()' : "datetime('now')"}
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      'SELECT count(*) AS total FROM "identity_registration_legal_acceptances"',
    )) as unknown as Array<{ total: number | string }>;
    const count = Number(rows[0]?.total);
    if (!Number.isFinite(count) || count > 0) {
      throw new Error(
        'No se puede revertir la migración: existen aceptaciones legales históricas.',
      );
    }
    await queryRunner.query(
      'DROP TABLE IF EXISTS "identity_registration_legal_acceptances"',
    );
  }
}
