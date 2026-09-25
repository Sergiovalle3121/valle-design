import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `cad_demo_shares`: el enlace TEMPORAL que se comparte desde `/demo`, sin
 * cuenta.
 *
 * ── QUÉ ES Y QUÉ NO ES ──────────────────────────────────────────────────────
 * Una copia de SÓLO LECTURA del dibujo que un visitante hizo en la
 * demostración, para que lo abra otra persona en su celular. No es un
 * documento: no tiene proyecto, ni versiones, ni CAS, ni organización. Nace
 * con caducidad (siete días) y el barrido `CadDemoShareCleanupService` la
 * borra cuando vence; la lectura también comprueba `expires_at`, así que un
 * barrido atrasado nunca sirve un enlace caducado.
 *
 * ── POR QUÉ NO TIENE `tenant_id` ────────────────────────────────────────────
 * Porque no pertenece a ningún tenant: la crea un visitante anónimo. No es un
 * dato de organización y por eso queda FUERA de `RLS_TABLES` y del rol
 * `valle_app` (que sólo recibe las tablas tenant). La cobertura RLS
 * (`tenant-rls-coverage.pg.spec.ts`) exige política a las tablas `cad_*` que
 * llevan `tenant_id`; ésta no lo lleva a propósito. Cuando su dueño crea
 * cuenta y la reclama, el contenido pasa a un documento del tenant y ESTA
 * fila se borra en la misma transacción.
 *
 * ── LO QUE NO SE GUARDA ─────────────────────────────────────────────────────
 * Ni la IP ni nada que identifique al visitante: el límite de creación usa la
 * tabla de límites con clave HMAC opaca, no esta tabla. Del enlace sólo se
 * guardan los sha256 de sus dos tokens (el de lectura y el de gestión), igual
 * que `cad_review_sessions.token_hash`.
 *
 * `down()` borra la tabla: son copias temporales que su visitante ya tiene en
 * su navegador.
 */
export class CadDemoShares20260924120000 implements MigrationInterface {
  name = 'CadDemoShares20260924120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "cad_demo_shares" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "token_hash" varchar(64) NOT NULL,
        "manage_hash" varchar(64) NOT NULL,
        "name" varchar(160) NOT NULL,
        "document_gzip" bytea NOT NULL,
        "gzip_bytes" integer NOT NULL,
        "entity_count" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        CONSTRAINT "chk_cad_demo_share_gzip_bytes"
          CHECK ("gzip_bytes" > 0 AND "gzip_bytes" <= 1048576),
        CONSTRAINT "chk_cad_demo_share_expiry"
          CHECK ("expires_at" > "created_at")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_cad_demo_share_token"
      ON "cad_demo_shares"("token_hash")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_cad_demo_share_manage"
      ON "cad_demo_shares"("manage_hash")
    `);
    // Sostiene el barrido (`WHERE expires_at < now()`) y el tope global diario.
    await queryRunner.query(`
      CREATE INDEX "idx_cad_demo_share_expires"
      ON "cad_demo_shares"("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "cad_demo_shares"`);
  }
}
