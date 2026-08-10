import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Conjuntos de planos (`cad_sheet_sets`) — el `.dst` de AutoCAD, en su propia
 * tabla.
 *
 * ADITIVA: no toca ninguna tabla existente. Un conjunto agrupa hojas de VARIOS
 * dibujos, así que no puede vivir dentro de `cad_documents` — ninguno de ellos
 * sería su dueño, y abrir el conjunto cargaría un documento entero para leer
 * una lista de veinte filas.
 *
 * `content` es JSON y no una tabla de hojas normalizada a propósito: el
 * conjunto se lee y se escribe SIEMPRE entero (reordenarlo cambia el número de
 * casi todas las hojas) y una tabla aparte obligaría a un borrado masivo en
 * cada guardado sin habilitar ninguna consulta que alguien vaya a hacer.
 *
 * `version` sostiene el CAS optimista, igual que `cad_document_version`.
 */
export class CreateCadSheetSets20260809100000 implements MigrationInterface {
  name = 'CreateCadSheetSets20260809100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const postgres = queryRunner.connection.options.type === 'postgres';
    const json = postgres ? 'jsonb' : 'text';
    const date = postgres ? 'timestamp' : 'datetime';
    const cadId = postgres ? 'uuid' : 'varchar(36)';
    const cadIdDefault = postgres ? ' DEFAULT gen_random_uuid()' : '';
    const tenantBase = `
        "tenant_id" varchar(36) NULL,
        "organization_id" varchar(36) NULL,
        "plant_id" varchar(36) NULL,
        "created_at" ${date} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" ${date} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" ${date} NULL,
        "created_by" varchar(255) NULL`;

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "cad_sheet_sets" (
        "id" ${cadId} PRIMARY KEY NOT NULL${cadIdDefault},${tenantBase},
        "project_id" ${cadId} NULL,
        "name" varchar(160) NOT NULL,
        "description" varchar(500) NULL,
        "content" ${json} NOT NULL,
        "version" integer NOT NULL DEFAULT 1
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_cad_sheet_set_scope"
       ON "cad_sheet_sets" ("tenant_id", "project_id")`,
    );
  }

  /** Rollback = drop de la tabla nueva. Nada más: no se tocó nada existente. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cad_sheet_sets"`);
  }
}
