import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BlobStore PROPIO de Design (`design_blobs`): almacenamiento content-addressed
 * de los archivos gzip del documento CAD canónico, modelado sobre el patrón
 * `doc_blobs` del monorepo origen y SUSTITUYÉNDOLO en este repo.
 *
 * - `blob_key` es la clave opaca que viaja dentro del puntero JSON `_storage`
 *   de `cad_documents.cad_document` — NUNCA hay FK hacia esta tabla.
 * - Deduplicación por (tenant_id, sha256): el mismo contenido dos veces es la
 *   misma fila (uq_design_blob_tenant_hash).
 * - `gc_marked_at` habilita el borrado en dos barridos: primero marcar el blob
 *   huérfano, después borrar; re-usar el contenido limpia la marca.
 *
 * Hoy los bytes viven en la base (bytea); MinIO del docker-compose queda
 * reservado para el adaptador S3 futuro con el mismo contrato.
 */
export class CreateDesignBlobs20260801120000 implements MigrationInterface {
  name = 'CreateDesignBlobs20260801120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const postgres = queryRunner.connection.options.type === 'postgres';
    const binary = postgres ? 'bytea' : 'blob';
    const date = postgres ? 'timestamp' : 'datetime';

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "design_blobs" (
        "blob_key" varchar(64) PRIMARY KEY NOT NULL,
        "tenant_id" varchar(36) NOT NULL,
        "sha256" varchar(64) NOT NULL,
        "size" integer NOT NULL,
        "data" ${binary} NOT NULL,
        "created_at" ${date} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "gc_marked_at" ${date} NULL,
        CONSTRAINT "uq_design_blob_tenant_hash" UNIQUE ("tenant_id", "sha256")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_design_blobs_tenant_key"
       ON "design_blobs" ("tenant_id", "blob_key")`,
    );
  }

  /** Rollback = drop de la tabla nueva. Nada más. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "design_blobs"`);
  }
}
