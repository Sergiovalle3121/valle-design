import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 5 (review links server-owned) — columnas ADITIVAS de
 * `cad_review_sessions` para el ciclo de vida del review link:
 *
 * 1. `expires_at` (timestamp NULL) — expiración del link, comprobada
 *    server-side en cada canje. NULL = sesión sin link.
 * 2. `revoked_at` (timestamp NULL) — revocación explícita: cerrar la sesión
 *    la estampa y el token muere de inmediato (el canje la verifica en cada
 *    request, no hay sesión derivada que sobreviva).
 * 3. `allow_comments` (boolean NOT NULL default true) — si el contexto de
 *    review (siempre read-only sobre el dibujo) puede crear/resolver
 *    comentarios.
 * 4. Índice ÚNICO parcial sobre `token_hash` — el canje busca por hash
 *    global (el tenant sale de la fila de la sesión, nunca del cliente) y
 *    dos sesiones no pueden compartir token.
 *
 * Aditivo puro con guards (patrón §145): en bases donde synchronize ya
 * materializó la entidad, es no-op.
 */
export class ReviewLinkOwnership20260802120000 implements MigrationInterface {
  name = 'ReviewLinkOwnership20260802120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const postgres = queryRunner.connection.options.type === 'postgres';
    const timestamp = postgres ? 'TIMESTAMP' : 'datetime';

    const addColumn = async (table: string, column: string, ddl: string) => {
      if (!(await queryRunner.hasColumn(table, column))) {
        await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN ${ddl}`);
      }
    };

    await addColumn(
      'cad_review_sessions',
      'expires_at',
      `"expires_at" ${timestamp} NULL`,
    );
    await addColumn(
      'cad_review_sessions',
      'revoked_at',
      `"revoked_at" ${timestamp} NULL`,
    );
    await addColumn(
      'cad_review_sessions',
      'allow_comments',
      `"allow_comments" boolean NOT NULL DEFAULT ${postgres ? 'true' : '1'}`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_cad_review_session_token"
       ON "cad_review_sessions" ("token_hash")
       WHERE "token_hash" IS NOT NULL`,
    );
  }

  /** Rollback = drop del índice y las columnas nuevas. Nada más. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_cad_review_session_token"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cad_review_sessions" DROP COLUMN IF EXISTS "allow_comments"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cad_review_sessions" DROP COLUMN IF EXISTS "revoked_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cad_review_sessions" DROP COLUMN IF EXISTS "expires_at"`,
    );
  }
}
