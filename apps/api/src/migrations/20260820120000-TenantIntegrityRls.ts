import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Integridad de tenant + Row-Level Security: la póliza contra el incidente
 * irreversible (una query sin scope devolviendo planos de otro despacho).
 *
 * Dos capas, en la base y no en la aplicación:
 *
 *   1 · `tenant_id` pasa a NOT NULL en las 7 tablas CAD de tenant. La octava
 *       (`sf_cad_blocks`) queda fuera A PROPÓSITO: su carril `tenant_id IS
 *       NULL` es la biblioteca de bloques de SISTEMA que siembra
 *       `ArchitecturalBlockLibrarySeed` — volverla NOT NULL borraría esa
 *       capacidad, no un descuido.
 *   2 · ROW LEVEL SECURITY en las 8, con política por tenant sobre
 *       `current_setting('app.tenant_id', true)`. Sin la variable de sesión,
 *       `current_setting(..., true)` devuelve NULL y la comparación no
 *       devuelve NINGUNA fila: el default es cerrado.
 *
 * El pre-check ABORTA la migración si alguna tabla aún tiene filas con
 * `tenant_id IS NULL` (fail-closed, sin mutar datos): adoptar esas filas es
 * una decisión del operador (`UPDATE ... SET tenant_id = ...`), no de un
 * script que corre solo en el despliegue. Consecuencia deliberada: las
 * importaciones enterprise que usaban el carril NULL de `cad_projects`/
 * `cad_documents` ahora exigen asignar tenant al importar.
 *
 * SIN `FORCE ROW LEVEL SECURITY`: el dueño de las tablas (el rol que corre
 * migraciones, hoy el mismo de la aplicación) no queda sujeto a la política,
 * así que este cambio no altera el comportamiento de la app — el scoping de
 * aplicación (TenantScopedRepository) sigue siendo la primera línea. La
 * política protege HOY a todo rol no-dueño (herramientas de soporte, lectores
 * de análisis, una credencial secundaria filtrada) y es la base para correr
 * la aplicación con un rol runtime no-dueño (guía en DEPLOYMENT.md).
 *
 * Reversible: `down` elimina políticas, desactiva RLS y devuelve NULLABLE.
 */

/**
 * Tablas CAD con tenant obligatorio (el carril NULL deja de existir).
 * Exportada para que otras migraciones/tests (p. ej. la cobertura de RLS de
 * `design_blobs` en 20260823120000) no dupliquen esta lista a mano — "ninguna
 * cifra vive en dos lugares".
 */
export const TENANT_REQUIRED_TABLES = [
  'cad_projects',
  'cad_documents',
  'cad_document_versions',
  'cad_publications',
  'cad_review_sessions',
  'cad_comments',
  'cad_sheet_sets',
] as const;

/** Todas las tablas CAD que reciben RLS (las 7 + la biblioteca de sistema). */
export const RLS_TABLES = [...TENANT_REQUIRED_TABLES, 'sf_cad_blocks'] as const;

export const TENANT_SETTING = `current_setting('app.tenant_id', true)`;

export class TenantIntegrityRls20260820120000 implements MigrationInterface {
  name = 'TenantIntegrityRls20260820120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Pre-check fail-closed: ninguna fila huérfana de tenant ─────────────
    for (const table of TENANT_REQUIRED_TABLES) {
      const [{ orphans }] = (await queryRunner.query(
        `SELECT COUNT(*)::int AS "orphans" FROM "${table}" WHERE "tenant_id" IS NULL`,
      )) as Array<{ orphans: number }>;
      if (orphans > 0) {
        throw new Error(
          `TenantIntegrityRls: "${table}" tiene ${orphans} fila(s) con ` +
            `tenant_id NULL. Esta migración no decide a qué tenant pertenecen: ` +
            `adóptalas primero (UPDATE "${table}" SET tenant_id = '<tenant>' ` +
            `WHERE tenant_id IS NULL) o elimínalas, y vuelve a desplegar. ` +
            `Nada fue modificado.`,
        );
      }
    }

    // ── Capa 1: NOT NULL ───────────────────────────────────────────────────
    for (const table of TENANT_REQUIRED_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "tenant_id" SET NOT NULL`,
      );
    }

    // ── Capa 2: RLS con política por tenant ────────────────────────────────
    for (const table of RLS_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `CREATE POLICY "p_${table}_tenant" ON "${table}"
           USING ("tenant_id" = ${TENANT_SETTING})
           WITH CHECK ("tenant_id" = ${TENANT_SETTING})`,
      );
    }

    // La biblioteca de sistema es legible por todos los tenants (es el
    // catálogo compartido), pero sólo legible: la política de arriba ya
    // impide que un tenant escriba en el carril NULL.
    await queryRunner.query(
      `CREATE POLICY "p_sf_cad_blocks_system_read" ON "sf_cad_blocks"
         FOR SELECT USING ("tenant_id" IS NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS "p_sf_cad_blocks_system_read" ON "sf_cad_blocks"`,
    );
    for (const table of RLS_TABLES) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS "p_${table}_tenant" ON "${table}"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`,
      );
    }
    for (const table of TENANT_REQUIRED_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "tenant_id" DROP NOT NULL`,
      );
    }
  }
}
