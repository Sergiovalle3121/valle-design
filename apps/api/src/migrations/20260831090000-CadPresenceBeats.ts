import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `cad_presence_beats`: el relevo de red de la presencia EN VIVO por servidor
 * (colaboración, frente `claude/colab-presencia-servidor`).
 *
 * ── QUÉ ES Y QUÉ NO ES ──────────────────────────────────────────────────────
 * No es historial. Es la última posición conocida de cada pestaña abierta
 * sobre cada documento: una fila por `(tenant_id, document_id, peer_id)`, que
 * SE SOBRESCRIBE en cada latido y se BORRA por el barrido de TTL
 * (`CadPresenceCleanupService`, cada ~30 s, filas con `updated_at` más viejo
 * que `CAD_PRESENCE_TTL_MS`). El documento canónico no se toca: esta tabla no
 * participa del CAS ni de la cola de guardado de `cad_documents`.
 *
 * ── POR QUÉ UNA TABLA Y NO SOLO MEMORIA DE PROCESO ─────────────────────────
 * El fan-out entre réplicas usa `LISTEN`/`NOTIFY` de PostgreSQL con un
 * payload mínimo (`{tenantId, documentId}`, muy por debajo del tope de 8 KB
 * de NOTIFY): cada réplica que recibe la notificación relee el snapshot de
 * ESTA tabla para el documento y lo retransmite a sus clientes SSE
 * conectados. Sin una tabla compartida, una réplica no tendría de dónde leer
 * lo que otra réplica acaba de escribir.
 *
 * RLS vive en la migración SIGUIENTE (`CadPresenceBeatsRls`), separada a
 * propósito: es el mismo patrón que este repo ya usa para `TenantIntegrityRls`
 * (20260820120000), y separarla es lo que permite que
 * `tenant-rls-coverage.pg.spec.ts` —que sincroniza las entidades y LUEGO
 * reproduce sólo las migraciones de RLS— pueda reproducirla sin chocar con un
 * `CREATE TABLE` sobre una tabla que el harness ya sincronizó.
 *
 * `down()` borra la tabla — es una pérdida real pero sin consecuencia
 * observable: son cursores de hace segundos, no un registro de nada.
 */
export class CadPresenceBeats20260831090000 implements MigrationInterface {
  name = 'CadPresenceBeats20260831090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "cad_presence_beats" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" varchar(36) NOT NULL,
        "document_id" uuid NOT NULL,
        "peer_id" varchar(100) NOT NULL,
        "name" varchar(160) NOT NULL,
        "cursor_x" double precision NULL,
        "cursor_y" double precision NULL,
        "viewport_min_x" double precision NULL,
        "viewport_min_y" double precision NULL,
        "viewport_max_x" double precision NULL,
        "viewport_max_y" double precision NULL,
        "guest" boolean NOT NULL DEFAULT false,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_cad_presence_beat_peer_id"
          CHECK (char_length("peer_id") BETWEEN 1 AND 100),
        CONSTRAINT "chk_cad_presence_beat_name"
          CHECK (char_length("name") <= 160)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_cad_presence_beat_peer"
      ON "cad_presence_beats"("tenant_id", "document_id", "peer_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_cad_presence_beat_document"
      ON "cad_presence_beats"("tenant_id", "document_id")
    `);
    // Sostiene el barrido de TTL (`WHERE updated_at < now() - interval`), que
    // recorre TODA la tabla en cada pasada, no un documento concreto.
    await queryRunner.query(`
      CREATE INDEX "idx_cad_presence_beat_updated"
      ON "cad_presence_beats"("updated_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "cad_presence_beats"`);
  }
}
