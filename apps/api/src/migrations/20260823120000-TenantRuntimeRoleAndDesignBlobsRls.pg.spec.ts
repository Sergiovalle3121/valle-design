import { randomBytes, randomUUID } from 'node:crypto';
import {
  allApplicationEntities,
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../common/testing/postgres-harness';
import { TenantIntegrityRls20260820120000 } from './20260820120000-TenantIntegrityRls';
import { TenantRuntimeRoleAndDesignBlobsRls20260823120000 } from './20260823120000-TenantRuntimeRoleAndDesignBlobsRls';

/**
 * Prueba, con PostgreSQL real y las credenciales EXACTAS del rol runtime, lo
 * que el ADR-0013 promete: `design_blobs` queda tan cerrada por defecto como
 * las otras ocho tablas CAD, y `valle_app` —no dueño— queda sujeto a esa
 * política sin necesidad de `FORCE` (`valle_app` nunca es dueño de las
 * tablas, así que `ENABLE` simple ya lo alcanza).
 *
 * `valle_app` es un rol CLUSTER-GLOBAL (no por-esquema); el bloque final de
 * `down()` puede dejarlo vivo a propósito si otro esquema en paralelo
 * (p. ej. `migration-chain.pg.spec.ts`, que también aplica esta migración)
 * todavía tiene privilegios pendientes sobre él — por eso este archivo NO
 * afirma que el rol desaparece del clúster, sólo que los efectos de ESTE
 * esquema (RLS, política, privilegios sobre sus propias tablas) se revierten
 * por completo.
 */
describePostgres(
  'TenantRuntimeRoleAndDesignBlobsRls (rol valle_app real)',
  () => {
    jest.setTimeout(120_000);

    let harness: PostgresHarness;
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const rlsMigration = new TenantIntegrityRls20260820120000();
    const roleMigration =
      new TenantRuntimeRoleAndDesignBlobsRls20260823120000();

    async function withRunner<T>(
      fn: (
        runner: ReturnType<PostgresHarness['dataSource']['createQueryRunner']>,
      ) => Promise<T>,
    ): Promise<T> {
      const runner = harness.dataSource.createQueryRunner();
      await runner.connect();
      try {
        await runner.query(`SET search_path TO "${harness.schema}"`);
        return await fn(runner);
      } finally {
        await runner.release();
      }
    }

    function rowSecurity(
      table: string,
    ): Promise<Array<{ relrowsecurity: boolean }>> {
      return harness.dataSource.query(
        `SELECT c."relrowsecurity"
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2`,
        [harness.schema, table],
      );
    }

    function policiesOn(table: string): Promise<Array<{ policyname: string }>> {
      return harness.dataSource.query(
        `SELECT policyname FROM pg_policies WHERE schemaname = $1 AND tablename = $2`,
        [harness.schema, table],
      );
    }

    beforeAll(async () => {
      harness = await createPostgresHarness(allApplicationEntities(), {
        schemaPrefix: 'tenant_role',
      });
      // Precondición del hallazgo P0-C: las 8 tablas ya bajo RLS, design_blobs
      // todavía NO (es exactamente el hueco que esta migración cierra).
      await withRunner((runner) => rlsMigration.up(runner));
    });

    afterAll(async () => {
      if (harness) {
        // Revierte lo de ESTE esquema (ver comentario del archivo sobre el rol
        // compartido). No se asume nada sobre el rol a nivel de clúster.
        await withRunner((runner) => roleMigration.down(runner)).catch(
          () => undefined,
        );
        await withRunner((runner) => rlsMigration.down(runner)).catch(
          () => undefined,
        );
        await harness.destroy();
      }
    });

    it('design_blobs arranca SIN RLS (el hueco confirmado antes del cambio)', async () => {
      expect(await rowSecurity('design_blobs')).toEqual([
        { relrowsecurity: false },
      ]);
      expect(await policiesOn('design_blobs')).toEqual([]);
    });

    it('up: design_blobs queda bajo RLS con la misma política que las otras 8, y valle_app existe con privilegios mínimos', async () => {
      await withRunner((runner) => roleMigration.up(runner));

      expect(await rowSecurity('design_blobs')).toEqual([
        { relrowsecurity: true },
      ]);
      expect(
        (await policiesOn('design_blobs')).map((p) => p.policyname),
      ).toEqual(['p_design_blobs_tenant']);

      const [role] = await harness.dataSource.query<
        Array<{
          rolsuper: boolean;
          rolcreatedb: boolean;
          rolcreaterole: boolean;
          rolbypassrls: boolean;
          rolcanlogin: boolean;
        }>
      >(
        `SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolcanlogin
         FROM pg_roles WHERE rolname = 'valle_app'`,
      );
      expect(role).toEqual({
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolbypassrls: false,
        rolcanlogin: true,
      });

      const tablePrivileges = await harness.dataSource.query<
        Array<{
          table_name: string;
          privilege_type: string;
          is_grantable: string;
        }>
      >(
        `SELECT table_name, privilege_type, is_grantable
         FROM information_schema.role_table_grants
        WHERE grantee = 'valle_app' AND table_schema = $1
        ORDER BY table_name, privilege_type`,
        [harness.schema],
      );
      const grantedTables = new Set(tablePrivileges.map((r) => r.table_name));
      expect(grantedTables).toEqual(
        new Set([
          'cad_projects',
          'cad_documents',
          'cad_document_versions',
          'cad_publications',
          'cad_review_sessions',
          'cad_comments',
          'cad_sheet_sets',
          'sf_cad_blocks',
          'design_blobs',
        ]),
      );
      // Sólo CRUD — nada de DDL (no hay "TRIGGER"/"REFERENCES" ni rastro de
      // privilegios de esquema más allá de USAGE).
      const distinctPrivileges = new Set(
        tablePrivileges.map((r) => r.privilege_type),
      );
      expect(distinctPrivileges).toEqual(
        new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
      );
      // Ninguna fila con is_grantable = 'YES': valle_app no puede otorgar a
      // nadie más lo que se le otorgó a él (nada de GRANT). La query ahora
      // SÍ selecciona `is_grantable` — antes esta aserción comparaba contra
      // `undefined` (columna nunca pedida al SELECT) y no podía fallar pase
      // lo que pase; se detectó al tipar la fila en vez de dejarla en `any`.
      expect(tablePrivileges.every((r) => r.is_grantable !== 'YES')).toBe(true);
    });

    describe('con el rol valle_app real (SET ROLE, no el dueño)', () => {
      const projectA = randomUUID();
      const projectB = randomUUID();
      const blobKeyA = 'blob-a-' + randomBytes(4).toString('hex');
      const blobKeyB = 'blob-b-' + randomBytes(4).toString('hex');

      beforeAll(async () => {
        await harness.dataSource.query(
          `INSERT INTO "${harness.schema}"."cad_projects" ("id", "tenant_id", "name", "status")
         VALUES ($1, $2, 'Plano A', 'active'), ($3, $4, 'Plano B', 'active')`,
          [projectA, tenantA, projectB, tenantB],
        );
        await harness.dataSource.query(
          `INSERT INTO "${harness.schema}"."design_blobs"
           ("blob_key", "tenant_id", "sha256", "size", "data")
         VALUES
           ($1, $2, repeat('a', 64), 3, decode('616263','hex')),
           ($3, $4, repeat('b', 64), 3, decode('646566','hex'))`,
          [blobKeyA, tenantA, blobKeyB, tenantB],
        );
      });

      it('Tenant A no ve, ni infiere, blobs ni proyectos de Tenant B', async () => {
        await withRunner(async (runner) => {
          await runner.query(`SET ROLE "valle_app"`);
          try {
            // Sin scope: cerrado por defecto en TODAS las tablas, incluida
            // design_blobs — ni A ni B, cero filas, no "todas".
            expect(
              await runner.query(
                `SELECT count(*)::int AS n FROM "design_blobs"`,
              ),
            ).toEqual([{ n: 0 }]);
            expect(
              await runner.query(
                `SELECT count(*)::int AS n FROM "cad_projects"`,
              ),
            ).toEqual([{ n: 0 }]);

            await runner.query(
              `SELECT set_config('app.tenant_id', $1, false)`,
              [tenantA],
            );
            expect(
              await runner.query(
                `SELECT "blob_key" FROM "design_blobs" ORDER BY "blob_key"`,
              ),
            ).toEqual([{ blob_key: blobKeyA }]);
            expect(
              await runner.query(`SELECT "id" FROM "cad_projects"`),
            ).toEqual([{ id: projectA }]);

            // No sólo "no lee": tampoco puede inferir la existencia del blob de
            // B pidiéndolo por su clave exacta.
            expect(
              await runner.query(
                `SELECT "blob_key" FROM "design_blobs" WHERE "blob_key" = $1`,
                [blobKeyB],
              ),
            ).toEqual([]);
          } finally {
            await runner.query(`RESET ROLE`).catch(() => undefined);
            await runner.query(`RESET ALL`).catch(() => undefined);
          }
        });
      });

      it('tenant_id corrupto (no coincide con NINGÚN tenant real) también ve cero filas, no "todas"', async () => {
        await withRunner(async (runner) => {
          await runner.query(`SET ROLE "valle_app"`);
          try {
            await runner.query(
              `SELECT set_config('app.tenant_id', $1, false)`,
              [
                randomUUID(), // un tenant que no existe en ninguna fila
              ],
            );
            expect(
              await runner.query(
                `SELECT count(*)::int AS n FROM "design_blobs"`,
              ),
            ).toEqual([{ n: 0 }]);
            expect(
              await runner.query(
                `SELECT count(*)::int AS n FROM "cad_projects"`,
              ),
            ).toEqual([{ n: 0 }]);
          } finally {
            await runner.query(`RESET ROLE`).catch(() => undefined);
            await runner.query(`RESET ALL`).catch(() => undefined);
          }
        });
      });

      it('valle_app no puede escribir en el tenant ajeno (WITH CHECK, 42501) ni en design_blobs', async () => {
        await withRunner(async (runner) => {
          await runner.query(`SET ROLE "valle_app"`);
          try {
            await runner.query(
              `SELECT set_config('app.tenant_id', $1, false)`,
              [tenantA],
            );
            await expect(
              runner.query(
                `INSERT INTO "design_blobs" ("blob_key", "tenant_id", "sha256", "size", "data")
               VALUES ($1, $2, repeat('c', 64), 3, decode('676869','hex'))`,
                ['blob-intruso-' + randomBytes(4).toString('hex'), tenantB],
              ),
            ).rejects.toMatchObject({
              driverError: expect.objectContaining({ code: '42501' }),
            });
          } finally {
            await runner.query(`RESET ROLE`).catch(() => undefined);
            await runner.query(`RESET ALL`).catch(() => undefined);
          }
        });
      });

      it('valle_app no tiene DDL ni puede otorgar privilegios a otros', async () => {
        await withRunner(async (runner) => {
          await runner.query(`SET ROLE "valle_app"`);
          try {
            await expect(
              runner.query(`CREATE TABLE "intento_ddl" ("id" int)`),
            ).rejects.toMatchObject({
              driverError: expect.objectContaining({ code: '42501' }),
            });
            await expect(
              runner.query(
                `GRANT SELECT ON "design_blobs" TO "${harness.schema}_nadie"`,
              ),
            ).rejects.toBeDefined();
          } finally {
            await runner.query(`RESET ROLE`).catch(() => undefined);
          }
        });
      });

      it('el dueño (rol de la migración) sigue sin sujetarse — decisión deliberada, sin FORCE', async () => {
        // La app de HOY corre como dueño; este cambio no altera su
        // comportamiento hasta el corte explícito documentado en el ADR-0013.
        const rows = await harness.dataSource.query<Array<{ n: number }>>(
          `SELECT count(*)::int AS n FROM "${harness.schema}"."design_blobs"`,
        );
        expect(rows).toEqual([{ n: 2 }]);
      });
    });

    it('down: revierte RLS/política de design_blobs y los privilegios de este esquema', async () => {
      await withRunner((runner) => roleMigration.down(runner));

      expect(await rowSecurity('design_blobs')).toEqual([
        { relrowsecurity: false },
      ]);
      expect(await policiesOn('design_blobs')).toEqual([]);

      const remainingGrants = await harness.dataSource.query<unknown[]>(
        `SELECT 1 FROM information_schema.role_table_grants
        WHERE grantee = 'valle_app' AND table_schema = $1`,
        [harness.schema],
      );
      expect(remainingGrants).toEqual([]);

      // Reversibilidad completa: up() puede reaplicarse tras el down().
      await withRunner((runner) => roleMigration.up(runner));
      expect(await rowSecurity('design_blobs')).toEqual([
        { relrowsecurity: true },
      ]);
    });
  },
);
