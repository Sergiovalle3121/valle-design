import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * REGISTRO DE ACEPTACIÓN LEGAL (`legal_acceptances`).
 *
 * Por qué existe: hasta aquí, los términos y el aviso de privacidad eran
 * páginas del web sin versión ni fecha. Se podían reescribir en un commit y
 * después nadie —ni el cliente ni el operador— podía afirmar qué texto aceptó
 * cada usuario ni cuándo. Para vender un piloto eso no es un detalle formal:
 * es la diferencia entre un acuerdo demostrable y una página web.
 *
 * Invariantes EN EL ESQUEMA, no en el código:
 * - una fila por (tenant, usuario, documento, versión): índice único. Aceptar
 *   dos veces la misma versión es idempotente, no un duplicado que después
 *   haya que interpretar;
 * - `document` acotado por CHECK a los documentos que existen. Un valor libre
 *   permitiría registrar aceptaciones de textos que nadie publicó nunca;
 * - `tenant_id = organization_id` por CHECK (ADR-0005), como el resto de datos
 *   propiedad de una organización;
 * - `accepted_at` NOT NULL con default `now()`: el instante lo pone el
 *   servidor. Una fecha que el cliente puede elegir no acredita nada.
 *
 * NO hay FK a `identity_users` ni a `organizations` a propósito: la aceptación
 * es un hecho histórico y debe SOBREVIVIR al borrado del usuario o de la
 * organización. Un `ON DELETE CASCADE` aquí destruiría precisamente la
 * evidencia el día que más falta hace.
 */
export class LegalAcceptances20260815140000 implements MigrationInterface {
  name = 'LegalAcceptances20260815140000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    const timestamp = isPostgres ? 'timestamptz' : 'datetime';
    const now = isPostgres ? 'now()' : "datetime('now')";

    await queryRunner.query(`
      CREATE TABLE "legal_acceptances" (
        "id" varchar(36) PRIMARY KEY,
        "tenant_id" varchar(36) NOT NULL,
        "organization_id" varchar(36) NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "document" varchar(40) NOT NULL,
        "version" varchar(40) NOT NULL,
        "accepted_at" ${timestamp} NOT NULL DEFAULT ${now},
        "created_at" ${timestamp} NOT NULL DEFAULT ${now},
        CONSTRAINT "chk_legal_acceptances_document"
          CHECK ("document" IN ('terms', 'privacy')),
        CONSTRAINT "chk_legal_acceptances_tenant"
          CHECK ("tenant_id" = "organization_id")
      )
    `);

    if (isPostgres) {
      // Red de seguridad para cualquier escritor que no pase por la entidad
      // (que genera el id en `@BeforeInsert`), igual que en design_audit_log.
      await queryRunner.query(
        `ALTER TABLE "legal_acceptances"
           ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text`,
      );
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_legal_acceptances_version"
      ON "legal_acceptances"("tenant_id", "user_id", "document", "version")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_legal_acceptances_user"
      ON "legal_acceptances"("tenant_id", "user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // `down` PROBADO: la tabla es nueva y no la referencia nadie, así que
    // revertirla es seguro mientras no se hayan registrado aceptaciones que
    // se quieran conservar. Si las hay, expórtalas ANTES: este DROP las borra.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_legal_acceptances_user"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_legal_acceptances_version"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "legal_acceptances"`);
  }
}
