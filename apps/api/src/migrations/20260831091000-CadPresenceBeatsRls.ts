import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Mismo rol runtime no-dueño que `TenantRuntimeRoleAndDesignBlobsRls` (20260823120000). */
const RUNTIME_ROLE = 'valle_app';

/**
 * RLS de `cad_presence_beats`, separada de su creación (20260831090000) por
 * el mismo motivo que `TenantIntegrityRls` (20260820120000) vive aparte de
 * las migraciones que crean las tablas `cad_*`: una migración de sólo
 * `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` se puede reproducir contra
 * una tabla que YA EXISTE (sincronizada por entidades en un harness de test,
 * o creada por la migración anterior en despliegue real) sin chocar con un
 * `CREATE TABLE` duplicado. `tenant-rls-coverage.pg.spec.ts` reproduce
 * exactamente esta migración sobre su harness sincronizado.
 *
 * Misma política que las demás tablas `cad_*`: por tenant, sobre
 * `current_setting('app.tenant_id', true)`, sin `FORCE ROW LEVEL SECURITY`
 * (el rol dueño de las tablas no queda sujeto — el scoping de aplicación,
 * `TenantScopedRepository` en modo estricto, sigue siendo la primera línea).
 *
 * También otorga a `valle_app` (el rol runtime no-dueño que
 * `TenantRuntimeRoleAndDesignBlobsRls` ya creó, con timestamp anterior — la
 * cadena de migraciones garantiza que corre primero) los mismos privilegios
 * mínimos que tiene sobre las otras nueve tablas tenant: sin este GRANT,
 * `cad_presence_beats` sería la única tabla tenant donde ese rol chocaría con
 * "permission denied" en vez de quedar correctamente vacío por RLS — un
 * fallo de PERMISO, no de AISLAMIENTO, y el escaneo de
 * `tenant-rls-coverage.pg.spec.ts` lo detecta.
 */
export class CadPresenceBeatsRls20260831091000 implements MigrationInterface {
  name = 'CadPresenceBeatsRls20260831091000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cad_presence_beats" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
      CREATE POLICY "p_cad_presence_beats_tenant" ON "cad_presence_beats"
        USING ("tenant_id" = current_setting('app.tenant_id', true))
        WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true))
    `);
    await queryRunner.query(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cad_presence_beats" TO "${RUNTIME_ROLE}"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE "cad_presence_beats" FROM "${RUNTIME_ROLE}"`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS "p_cad_presence_beats_tenant" ON "cad_presence_beats"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cad_presence_beats" DISABLE ROW LEVEL SECURITY`,
    );
  }
}
