import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 4 (migración de datos enterprise→design) — columnas ADITIVAS que la
 * herramienta de importación (`src/migration-cli/`) necesita para preservar el
 * modelo legacy sin inventar tablas nuevas:
 *
 * 1. `cad_documents.legacy_metadata` (jsonb NULL) — metadata industrial de la
 *    fila `sf_line_layouts` de origen que NO tiene columna propia en Design:
 *    connectors/assets/annotations/cells, aprobación (status/by/at/note),
 *    footprint y el resumen de snapshots. Es evidencia de la copia, no un
 *    contrato del editor: NULL en documentos nativos.
 *
 * 2. `cad_document_versions.label` + `legacy_source_id` — las versiones CAS
 *    derivadas de snapshots legacy llegan ETIQUETADAS (nombre del snapshot) y
 *    con su id de origen (`<layoutId>:v<version>` o el id del snapshot) para
 *    idempotencia/rollback exactos. NULL en versiones nativas.
 *
 * 3. `sf_cad_blocks.legacy_source_id` — id del bloque de origen; único por
 *    tenant cuando no es nulo (índice parcial + lane de sistema, mismo patrón
 *    `erp_bank_transactions` que usan cad_projects/cad_documents).
 *
 * Aditivo puro con guards (patrón §145): en bases donde synchronize ya
 * materializó las entidades, es no-op.
 */
export class MigrationLegacyImport20260802090000 implements MigrationInterface {
  name = 'MigrationLegacyImport20260802090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const postgres = queryRunner.connection.options.type === 'postgres';
    const json = postgres ? 'jsonb' : 'text';

    const addColumn = async (table: string, column: string, ddl: string) => {
      if (!(await queryRunner.hasColumn(table, column))) {
        await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN ${ddl}`);
      }
    };

    await addColumn(
      'cad_documents',
      'legacy_metadata',
      `"legacy_metadata" ${json} NULL`,
    );
    await addColumn(
      'cad_document_versions',
      'label',
      `"label" varchar(120) NULL`,
    );
    await addColumn(
      'cad_document_versions',
      'legacy_source_id',
      `"legacy_source_id" varchar(96) NULL`,
    );
    await addColumn(
      'sf_cad_blocks',
      'legacy_source_id',
      `"legacy_source_id" varchar(64) NULL`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_sf_cad_block_tenant_legacy"
       ON "sf_cad_blocks" ("tenant_id", "legacy_source_id")
       WHERE "legacy_source_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_sf_cad_block_legacy_lane"
       ON "sf_cad_blocks" ("legacy_source_id")
       WHERE "tenant_id" IS NULL AND "legacy_source_id" IS NOT NULL`,
    );
  }

  /** Rollback = drop de los índices y columnas nuevos. Nada más. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_sf_cad_block_legacy_lane"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_sf_cad_block_tenant_legacy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sf_cad_blocks" DROP COLUMN IF EXISTS "legacy_source_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cad_document_versions" DROP COLUMN IF EXISTS "legacy_source_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cad_document_versions" DROP COLUMN IF EXISTS "label"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cad_documents" DROP COLUMN IF EXISTS "legacy_metadata"`,
    );
  }
}
