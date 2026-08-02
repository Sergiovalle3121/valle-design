import { Logger } from '@nestjs/common';
import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PURGA DE SECRETOS HEREDADOS — `collaboration.reviewLinks[].token`.
 *
 * Antecedente: durante una fase el navegador GENERABA el token del review
 * link (`crypto.randomUUID()`), lo metía en el JSON del documento canónico y
 * lo pegaba en la URL como `?cadReview=<token>`. Ese esquema convivía con el
 * real —server-owned, sólo `sha256` en `cad_review_sessions.token_hash`— y
 * dejaba tokens en CLARO dentro de `cad_documents.cad_document` y de cada fila
 * de `cad_document_versions`. Cualquiera con permiso de LECTURA sobre el
 * documento (incluido un invitado por review link) se llevaba los tokens de
 * compartición de todos los enlaces.
 *
 * Esta migración BORRA la clave `token` de cada elemento de
 * `collaboration.reviewLinks` conservando el resto del enlace (id, label,
 * readOnly, fechas) y marcando `hasToken: true` — el mismo metadato no
 * sensible que produce hoy la redacción en la frontera de la API
 * (`redactCadDocumentSecrets`). El documento sigue validando: `token` dejó de
 * ser obligatorio.
 *
 * IDEMPOTENTE: el `WHERE` sólo alcanza filas que TODAVÍA tienen algún `token`;
 * re-ejecutarla no toca nada. Registra conteos antes/después.
 *
 * `down` NO reintroduce secretos: el token en claro no existe en ninguna parte
 * (sólo se persistió su valor, que aquí se destruye, y jamás se guardó copia).
 * Deshacer una purga de credenciales no es una operación legítima; el rollback
 * es un no-op explícito y documentado.
 *
 * LIMITACIÓN CONOCIDA — documentos en BLOB: cuando el documento supera el
 * umbral inline se persiste como puntero (`{"_storage":{"kind":
 * "document_blob","blobKey":…}}`) y el JSON real vive comprimido en el blob
 * store, fuera del alcance de SQL. Esta migración NO puede purgarlos y no
 * finge hacerlo: los cuenta y los reporta. Mitigación efectiva mientras tanto:
 * la API rehidrata SIEMPRE por `hydrateCadDocument` →
 * `validateCadDocumentPayload` → `redactCadDocumentSecrets`, así que un token
 * dentro de un blob no sale por ninguna respuesta ni se vuelve a escribir (al
 * regrabarse el documento se persiste ya redactado). Procedimiento propuesto
 * para el borrado físico: job fuera de banda que, por cada documento con
 * puntero, lo rehidrate con el servicio, lo vuelva a almacenar con
 * `restoreStoredCadDocument()` (que reescribe el blob ya redactado) y avance
 * el CAS — no se hace aquí porque una migración SQL no puede hablar con el
 * blob store.
 */
export class PurgeReviewLinkTokens20260802140000 implements MigrationInterface {
  name = 'PurgeReviewLinkTokens20260802140000';

  private readonly logger = new Logger(
    PurgeReviewLinkTokens20260802140000.name,
  );

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      // El JSON sólo es consultable como jsonb en PostgreSQL (en SQLite la
      // columna es `simple-json`, texto plano). Fuera de PostgreSQL la purga
      // la hace la redacción de la frontera al reescribir el documento.
      this.logger.warn(
        'PurgeReviewLinkTokens: motor no PostgreSQL — purga SQL omitida.',
      );
      return;
    }

    for (const table of ['cad_documents', 'cad_document_versions']) {
      if (!(await queryRunner.hasTable(table))) continue;

      const before = await this.countRowsWithTokens(queryRunner, table);
      const blobs = await this.countBlobPointers(queryRunner, table);

      await queryRunner.query(`
        UPDATE "${table}" AS t
        SET "cad_document" = jsonb_set(
              t."cad_document",
              '{collaboration,reviewLinks}',
              COALESCE((
                SELECT jsonb_agg((link - 'token') || '{"hasToken": true}'::jsonb
                                 ORDER BY ord)
                FROM jsonb_array_elements(
                       t."cad_document"->'collaboration'->'reviewLinks'
                     ) WITH ORDINALITY AS elements(link, ord)
              ), '[]'::jsonb)
            )
        WHERE jsonb_typeof(t."cad_document") = 'object'
          AND jsonb_typeof(
                t."cad_document"->'collaboration'->'reviewLinks'
              ) = 'array'
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
                   t."cad_document"->'collaboration'->'reviewLinks'
                 ) AS link
            WHERE jsonb_typeof(link) = 'object' AND link ? 'token'
          )
      `);

      const after = await this.countRowsWithTokens(queryRunner, table);
      this.logger.log(
        `PurgeReviewLinkTokens · ${table}: ${before} fila(s) con token → ${after} tras la purga` +
          (blobs
            ? `; ${blobs} fila(s) en blob NO alcanzables por SQL (ver limitación en la cabecera)`
            : ''),
      );
      if (after !== 0) {
        throw new Error(
          `PurgeReviewLinkTokens: quedan ${after} fila(s) con token en "${table}".`,
        );
      }
    }
  }

  /** Rollback deliberadamente vacío: restaurar un secreto purgado no es válido. */
  public async down(): Promise<void> {
    this.logger.warn(
      'PurgeReviewLinkTokens.down es un no-op: los tokens purgados no se ' +
        'reintroducen (nunca hubo copia y reponerlos sería reabrir la fuga).',
    );
  }

  /** Filas cuyo JSON inline aún contiene algún `reviewLinks[].token`. */
  private async countRowsWithTokens(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<number> {
    const rows = (await queryRunner.query(`
      SELECT count(*)::int AS total
      FROM "${table}" AS t
      WHERE jsonb_typeof(t."cad_document") = 'object'
        AND jsonb_typeof(
              t."cad_document"->'collaboration'->'reviewLinks'
            ) = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
                 t."cad_document"->'collaboration'->'reviewLinks'
               ) AS link
          WHERE jsonb_typeof(link) = 'object' AND link ? 'token'
        )
    `)) as Array<{ total: number }>;
    return Number(rows[0]?.total ?? 0);
  }

  /** Filas cuyo documento vive en el blob store (fuera del alcance de SQL). */
  private async countBlobPointers(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<number> {
    const rows = (await queryRunner.query(`
      SELECT count(*)::int AS total
      FROM "${table}" AS t
      WHERE t."cad_document"->'_storage'->>'kind' = 'document_blob'
    `)) as Array<{ total: number }>;
    return Number(rows[0]?.total ?? 0);
  }
}
