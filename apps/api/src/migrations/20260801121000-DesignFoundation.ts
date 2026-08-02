import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fundación propia del producto Design (segunda migración nueva del repo):
 *
 * 1. `design_audit_log` — bitácora de auditoría server-owned que SUSTITUYE al
 *    event ledger de Enterprise para los asientos CAD y las denegaciones RBAC.
 *    Append-only; tenant y actor salen del contexto autenticado. La auditoría
 *    de Fase 5 (comercialización) se apoya en esta tabla.
 *
 * 2. Columnas `dxf_*` en `cad_documents` — el plano DXF de fondo del contrato
 *    v1 (`GET/PUT/DELETE /dxf`). En el origen esas columnas viven en la tabla
 *    industrial `sf_line_layouts`; el modelo de datos propio de Design las
 *    necesita en su fila dueña. Mismos tipos/defaults que el origen; NULL en
 *    `dxf_data` = sin plano de fondo.
 */
export class DesignFoundation20260801121000 implements MigrationInterface {
  name = 'DesignFoundation20260801121000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const postgres = queryRunner.connection.options.type === 'postgres';
    const json = postgres ? 'jsonb' : 'text';
    const date = postgres ? 'timestamp' : 'datetime';

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "design_audit_log" (
        "id" varchar(36) PRIMARY KEY NOT NULL,
        "tenant_id" varchar(36) NULL,
        "actor" varchar(255) NULL,
        "action" varchar(120) NOT NULL,
        "reference_type" varchar(120) NULL,
        "reference_id" varchar(255) NULL,
        "payload" ${json} NULL,
        "created_at" ${date} NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_design_audit_scope"
       ON "design_audit_log" ("tenant_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_design_audit_reference"
       ON "design_audit_log" ("tenant_id", "reference_type", "reference_id")`,
    );

    // Columnas del plano DXF de fondo (mismos tipos/defaults que el origen).
    const addColumn = async (ddl: string) => {
      // "IF NOT EXISTS" de columnas no existe en SQLite: la cadena de
      // migraciones sólo corre sobre PostgreSQL (typeorm-cli exige
      // DATABASE_URL); en dev SQLite el esquema lo materializa synchronize.
      await queryRunner.query(`ALTER TABLE "cad_documents" ADD COLUMN ${ddl}`);
    };
    await addColumn(`"dxf_data" text NULL`);
    await addColumn(`"dxf_name" varchar(255) NULL`);
    await addColumn(`"dxf_offset_x" double precision NOT NULL DEFAULT 0`);
    await addColumn(`"dxf_offset_y" double precision NOT NULL DEFAULT 0`);
    await addColumn(`"dxf_scale" double precision NOT NULL DEFAULT 1`);
    await addColumn(`"dxf_rotation" double precision NOT NULL DEFAULT 0`);
    await addColumn(`"dxf_visible" boolean NOT NULL DEFAULT true`);
    await addColumn(`"dxf_opacity" double precision NOT NULL DEFAULT 0.5`);
  }

  /** Rollback = drop de la tabla y de las columnas nuevas. Nada más. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "design_audit_log"`);
    for (const column of [
      'dxf_opacity',
      'dxf_visible',
      'dxf_rotation',
      'dxf_scale',
      'dxf_offset_y',
      'dxf_offset_x',
      'dxf_name',
      'dxf_data',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "cad_documents" DROP COLUMN IF EXISTS "${column}"`,
      );
    }
  }
}
