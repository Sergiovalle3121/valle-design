import type { MigrationInterface, QueryRunner } from 'typeorm';
import {
  RLS_TABLES,
  TENANT_SETTING,
} from './20260820120000-TenantIntegrityRls';

/**
 * Cierra el hueco que dejó `TenantIntegrityRls` (20260820120000) y prepara —
 * sin activarlo todavía — el rol runtime no dueño. Ver ADR-0013 para el
 * razonamiento completo; aquí sólo el resumen operativo.
 *
 * DOS piezas, ambas ADITIVAS y de bajo riesgo porque ninguna cambia el
 * comportamiento de la aplicación HOY (que sigue conectando como el rol
 * dueño):
 *
 *   1 · `design_blobs` (bytes gzip del plano) recibe `ENABLE ROW LEVEL
 *       SECURITY` + la MISMA política que las otras ocho tablas CAD:
 *       `tenant_id = current_setting('app.tenant_id', true)`. Su columna
 *       `tenant_id` ya es `NOT NULL` desde `CreateDesignBlobs`
 *       (20260801120000) — no hace falta pre-check de huérfanos aquí.
 *   2 · El rol `valle_app`: NO dueño de las tablas, `NOSUPERUSER
 *       NOCREATEDB NOCREATEROLE NOBYPASSRLS`, con `SELECT, INSERT, UPDATE,
 *       DELETE` ÚNICAMENTE sobre las nueve tablas tenant identificadas hoy
 *       (`RLS_TABLES` + `design_blobs`). Nada de DDL, nada de GRANT, nada de
 *       `ALTER DEFAULT PRIVILEGES`. Se crea SIN contraseña — fijarla es un
 *       paso del operador, fuera de control de versiones (una migración
 *       nunca lleva un secreto).
 *
 * `valle_app`, al no ser dueño, YA queda sujeto a las políticas RLS de las
 * nueve tablas con `ENABLE` simple — no necesita `FORCE`. Esta migración NO
 * añade `FORCE ROW LEVEL SECURITY` a ninguna tabla: hacerlo forzaría la
 * política también sobre el rol DUEÑO (la app de producción de hoy), que
 * nunca fija `app.tenant_id` — resultado: cero filas para tráfico legítimo,
 * un apagón, no un endurecimiento. `FORCE` queda para una migración de
 * seguimiento posterior a que el corte de `DATABASE_URL` a `valle_app` esté
 * verificado (ADR-0013, sección "orden seguro").
 *
 * Rollback operacional: si algo sale mal en producción DESPUÉS de haber
 * cortado `DATABASE_URL` a `valle_app`, el primer paso es revertir esa
 * variable de entorno al rol dueño (fuera de esta migración, es
 * configuración de despliegue) — NO correr `down()` con conexiones activas
 * bajo `valle_app` todavía abiertas. Con eso hecho, `down()` revoca los
 * privilegios de este esquema, apaga RLS en `design_blobs`, quita la
 * política y elimina el rol SI Y SÓLO SI ya no le queda ningún privilegio
 * pendiente en ningún otro esquema (si le queda, el rol se conserva a
 * propósito — ver el comentario junto a `DROP ROLE` en `down()`).
 */

/** Las nueve tablas tenant candidatas hoy: las ocho de RLS_TABLES + el blob store. */
const RUNTIME_ROLE_TABLES = [...RLS_TABLES, 'design_blobs'] as const;

const RUNTIME_ROLE = 'valle_app';

/**
 * `valle_app` es un nombre de rol FIJO (a diferencia del `tenant_id`, que sí
 * varía por prueba): es cluster-global, no por-esquema, así que dos suites de
 * prueba que corren en paralelo contra el MISMO PostgreSQL (cada una con su
 * propio esquema desechable, `postgres-harness.ts`) pueden pisarse al crear o
 * eliminar el rol al mismo tiempo. El lock consultivo serializa sólo ese
 * instante de creación/eliminación entre sesiones — no bloquea nada del resto
 * de la migración ni de la aplicación, y en el único-proceso real de
 * despliegue (DEPLOYMENT.md) es un no-op de microsegundos.
 */
const ROLE_LOCK_KEY = `hashtext('${RUNTIME_ROLE}_role_provisioning')`;

export class TenantRuntimeRoleAndDesignBlobsRls20260823120000 implements MigrationInterface {
  name = 'TenantRuntimeRoleAndDesignBlobsRls20260823120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Pieza 1: RLS en design_blobs, mismo patrón que las otras 8 ─────────
    await queryRunner.query(
      `ALTER TABLE "design_blobs" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `CREATE POLICY "p_design_blobs_tenant" ON "design_blobs"
         USING ("tenant_id" = ${TENANT_SETTING})
         WITH CHECK ("tenant_id" = ${TENANT_SETTING})`,
    );

    // ── Pieza 2: rol runtime no dueño, privilegios mínimos ──────────────────
    // CREATE ROLE no soporta IF NOT EXISTS; se comprueba con pg_roles para
    // que re-aplicar esta migración en un entorno donde el rol ya existe
    // (p. ej. creado manualmente por un operador) no rompa con "ya existe".
    // El lock consultivo evita la carrera de dos sesiones creando el mismo
    // rol cluster-global a la vez (ver comentario de ROLE_LOCK_KEY arriba).
    await queryRunner.query(`SELECT pg_advisory_lock(${ROLE_LOCK_KEY})`);
    try {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE}') THEN
            CREATE ROLE "${RUNTIME_ROLE}"
              LOGIN
              NOSUPERUSER
              NOCREATEDB
              NOCREATEROLE
              NOINHERIT
              NOREPLICATION
              NOBYPASSRLS
              CONNECTION LIMIT -1;
          END IF;
        END
        $$;
      `);
    } finally {
      await queryRunner.query(`SELECT pg_advisory_unlock(${ROLE_LOCK_KEY})`);
    }

    // El esquema activo (search_path[0]) — 'public' en producción, el esquema
    // desechable de la suite en pruebas. Sin esto el GRANT de abajo apuntaría
    // siempre a 'public' aunque la migración corra contra un esquema de
    // prueba aislado.
    const [{ schema }] = (await queryRunner.query(
      `SELECT current_schema() AS schema`,
    )) as Array<{ schema: string }>;

    await queryRunner.query(
      `GRANT USAGE ON SCHEMA "${schema}" TO "${RUNTIME_ROLE}"`,
    );

    for (const table of RUNTIME_ROLE_TABLES) {
      await queryRunner.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "${table}" TO "${RUNTIME_ROLE}"`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ schema }] = (await queryRunner.query(
      `SELECT current_schema() AS schema`,
    )) as Array<{ schema: string }>;

    // Revoca SIEMPRE lo que esta migración otorgó en ESTE esquema — efecto
    // determinista e inmediato sin importar qué otro esquema (otro tenant de
    // prueba, en paralelo) también tenga privilegios vigentes sobre el rol.
    for (const table of RUNTIME_ROLE_TABLES) {
      await queryRunner.query(
        `REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE "${table}" FROM "${RUNTIME_ROLE}"`,
      );
    }
    await queryRunner.query(
      `REVOKE USAGE ON SCHEMA "${schema}" FROM "${RUNTIME_ROLE}"`,
    );

    // El rol es cluster-global: sólo se elimina si YA NO tiene privilegios
    // pendientes en NINGÚN esquema (p. ej. otro despliegue/esquema que
    // también lo use). Si todavía los tiene, Postgres levanta
    // `dependent_objects_still_exist` (2BP01) — se registra con RAISE NOTICE
    // y el rol queda vivo a propósito: revertir ESTA migración no debe poder
    // tumbar el acceso de otro consumidor legítimo del mismo rol. El operador
    // que necesite eliminarlo por completo lo hace explícitamente una vez
    // confirmado que nada más lo usa.
    await queryRunner.query(`SELECT pg_advisory_lock(${ROLE_LOCK_KEY})`);
    try {
      await queryRunner.query(`
        DO $$
        BEGIN
          DROP ROLE IF EXISTS "${RUNTIME_ROLE}";
        EXCEPTION WHEN dependent_objects_still_exist THEN
          RAISE NOTICE '${RUNTIME_ROLE} conserva privilegios en otro esquema; no se eliminó.';
        END
        $$;
      `);
    } finally {
      await queryRunner.query(`SELECT pg_advisory_unlock(${ROLE_LOCK_KEY})`);
    }

    await queryRunner.query(
      `DROP POLICY IF EXISTS "p_design_blobs_tenant" ON "design_blobs"`,
    );
    await queryRunner.query(
      `ALTER TABLE "design_blobs" DISABLE ROW LEVEL SECURITY`,
    );
  }
}
