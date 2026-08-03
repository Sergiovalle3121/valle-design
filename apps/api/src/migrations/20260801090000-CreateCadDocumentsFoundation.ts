import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Modelo de datos CAD propio (WP3): las seis tablas cad_* del producto Design
 * — proyectos, documentos, historial de versiones, publicaciones, sesiones de
 * revisión y comentarios.
 *
 * ADITIVA por contrato de misión: NO toca `sf_line_layouts` (la tabla legacy
 * MIXTA sigue siendo la fuente de verdad del guardado; los datos históricos se
 * copian en Fase 4, no aquí). Las FKs existen SOLO entre tablas cad_* — la
 * referencia al blob store (`doc_blobs`) viaja como `blobKey` string dentro del
 * puntero JSON, nunca como FK.
 *
 * `legacy_source_id` es único por tenant cuando no es nulo (índice parcial),
 * con el lane de sistema (`tenant_id IS NULL`) cubierto por su propio índice
 * parcial — mismo patrón que `erp_bank_transactions`.
 */
export class CreateCadDocumentsFoundation20260801090000 implements MigrationInterface {
  name = 'CreateCadDocumentsFoundation20260801090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const postgres = queryRunner.connection.options.type === 'postgres';
    const json = postgres ? 'jsonb' : 'text';
    const date = postgres ? 'timestamp' : 'datetime';
    // PostgreSQL usa UUID nativo y genera el id en la propia base. SQLite no
    // tiene un tipo UUID real: PrimaryGeneratedColumn('uuid') de TypeORM lo
    // representa como varchar y genera el valor en la aplicacion.
    const cadId = postgres ? 'uuid' : 'varchar(36)';
    const cadIdDefault = postgres ? ' DEFAULT gen_random_uuid()' : '';
    // Columnas comunes de TenantBaseEntity (tenant nullable durante la fase de
    // migración multi-tenant, igual que el resto de tablas sf_*/cad del repo).
    const tenantBase = `
        "tenant_id" varchar(36) NULL,
        "organization_id" varchar(36) NULL,
        "plant_id" varchar(36) NULL,
        "created_at" ${date} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" ${date} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" ${date} NULL,
        "created_by" varchar(255) NULL`;

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "cad_projects" (
        "id" ${cadId} PRIMARY KEY NOT NULL${cadIdDefault},${tenantBase},
        "name" varchar(160) NOT NULL,
        "description" varchar(500) NULL,
        "status" varchar(24) NOT NULL DEFAULT 'active',
        "legacy_source_id" varchar(64) NULL
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "cad_documents" (
        "id" ${cadId} PRIMARY KEY NOT NULL${cadIdDefault},${tenantBase},
        "project_id" ${cadId} NULL,
        "name" varchar(160) NOT NULL,
        "model" varchar(64) NULL,
        "revision" varchar(16) NULL,
        "cad_document" ${json} NULL,
        "cad_document_version" integer NOT NULL DEFAULT 0,
        "layers" ${json} NULL,
        "legacy_source_id" varchar(36) NULL,
        CONSTRAINT "fk_cad_document_project"
          FOREIGN KEY ("project_id") REFERENCES "cad_projects" ("id")
          ON DELETE SET NULL
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "cad_document_versions" (
        "id" ${cadId} PRIMARY KEY NOT NULL${cadIdDefault},${tenantBase},
        "document_id" ${cadId} NOT NULL,
        "version" integer NOT NULL,
        "cad_document" ${json} NOT NULL,
        "sha256" varchar(64) NULL,
        CONSTRAINT "fk_cad_document_version_document"
          FOREIGN KEY ("document_id") REFERENCES "cad_documents" ("id")
          ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "cad_publications" (
        "id" ${cadId} PRIMARY KEY NOT NULL${cadIdDefault},${tenantBase},
        "document_id" ${cadId} NOT NULL,
        "file_name" varchar(255) NOT NULL,
        "sha256" varchar(64) NOT NULL,
        "bytes" integer NOT NULL,
        "paper_space_ids" ${json} NOT NULL,
        "published_by" varchar(255) NOT NULL,
        "published_at" ${date} NOT NULL,
        "legacy_source_id" varchar(64) NULL,
        CONSTRAINT "fk_cad_publication_document"
          FOREIGN KEY ("document_id") REFERENCES "cad_documents" ("id")
          ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "cad_review_sessions" (
        "id" ${cadId} PRIMARY KEY NOT NULL${cadIdDefault},${tenantBase},
        "document_id" ${cadId} NOT NULL,
        "status" varchar(24) NOT NULL DEFAULT 'open',
        "closed_at" ${date} NULL,
        "token_hash" varchar(64) NULL,
        "legacy_source_id" varchar(64) NULL,
        CONSTRAINT "fk_cad_review_session_document"
          FOREIGN KEY ("document_id") REFERENCES "cad_documents" ("id")
          ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "cad_comments" (
        "id" ${cadId} PRIMARY KEY NOT NULL${cadIdDefault},${tenantBase},
        "review_session_id" ${cadId} NULL,
        "document_id" ${cadId} NOT NULL,
        "author" varchar(255) NOT NULL,
        "body" text NOT NULL,
        "anchor" ${json} NULL,
        "resolved" boolean NOT NULL DEFAULT false,
        "legacy_source_id" varchar(64) NULL,
        CONSTRAINT "fk_cad_comment_review_session"
          FOREIGN KEY ("review_session_id") REFERENCES "cad_review_sessions" ("id")
          ON DELETE SET NULL,
        CONSTRAINT "fk_cad_comment_document"
          FOREIGN KEY ("document_id") REFERENCES "cad_documents" ("id")
          ON DELETE CASCADE
      )`,
    );

    // Índices — mismos nombres que los @Index de las entidades para que
    // synchronize (dev) y la cadena de migraciones (prod) converjan.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_cad_project_scope"
       ON "cad_projects" ("tenant_id", "plant_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_cad_project_tenant_legacy"
       ON "cad_projects" ("tenant_id", "legacy_source_id")
       WHERE "legacy_source_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_cad_project_legacy_lane"
       ON "cad_projects" ("legacy_source_id")
       WHERE "tenant_id" IS NULL AND "legacy_source_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_cad_document_scope"
       ON "cad_documents" ("tenant_id", "plant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_cad_document_project"
       ON "cad_documents" ("tenant_id", "project_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_cad_document_tenant_legacy"
       ON "cad_documents" ("tenant_id", "legacy_source_id")
       WHERE "legacy_source_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_cad_document_legacy_lane"
       ON "cad_documents" ("legacy_source_id")
       WHERE "tenant_id" IS NULL AND "legacy_source_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_cad_document_version_scope"
       ON "cad_document_versions" ("tenant_id", "document_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_cad_document_version"
       ON "cad_document_versions" ("document_id", "version")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_cad_publication_scope"
       ON "cad_publications" ("tenant_id", "document_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_cad_review_session_scope"
       ON "cad_review_sessions" ("tenant_id", "document_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_cad_comment_scope"
       ON "cad_comments" ("tenant_id", "document_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_cad_comment_session"
       ON "cad_comments" ("tenant_id", "review_session_id")`,
    );
  }

  /** Rollback = drop de las SEIS tablas nuevas, en orden de dependencia. Nada más. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cad_comments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cad_review_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cad_publications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cad_document_versions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cad_documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cad_projects"`);
  }
}
