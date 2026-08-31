import { randomUUID } from 'node:crypto';
import {
  allApplicationEntities,
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../common/testing/postgres-harness';
import { TenantIntegrityRls20260820120000 } from './20260820120000-TenantIntegrityRls';
import { TenantRuntimeRoleAndDesignBlobsRls20260823120000 } from './20260823120000-TenantRuntimeRoleAndDesignBlobsRls';
import { CadPresenceBeatsRls20260831093000 } from './20260831093000-CadPresenceBeatsRls';

/**
 * El escaneo que `design_blobs` necesitaba y no tenía: una tabla del dominio
 * CAD/design con columna `tenant_id` que NO aparece en el registro manual de
 * `TenantIntegrityRls` (`RLS_TABLES`) hoy simplemente no se prueba — y nadie
 * lo nota hasta que alguien la consulta sin scope. Esta suite deriva la lista
 * esperada del ESQUEMA REAL (no de memoria) y falla si alguna tabla CAD con
 * `tenant_id` no tiene `ENABLE ROW LEVEL SECURITY` + al menos una política.
 *
 * Alcance deliberado: sólo el dominio CAD/design (`cad_*`, `sf_cad_blocks`,
 * `design_blobs`) — el hallazgo P0-C es sobre ESTE dominio. Otras tablas con
 * `tenant_id`/`organization_id` (comercial, identidad, auditoría — p. ej.
 * `subscriptions`, `invoices`, `legal_acceptances`, `design_audit_log`) NO
 * están bajo RLS todavía y quedan fuera de este frente a propósito: tocarlas
 * es un cambio de scope distinto (ver ADR-0013 y el reporte de esta sesión).
 * El segundo test de este archivo lo deja constando explícitamente, para que
 * la brecha sea visible en vez de silenciosa.
 */
describePostgres(
  'cobertura de RLS en el dominio CAD/design (escaneo real)',
  () => {
    jest.setTimeout(120_000);

    let harness: PostgresHarness;

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

    /** Toda tabla del dominio CAD/design con columna `tenant_id`, del catálogo REAL. */
    async function cadTenantTables(): Promise<string[]> {
      const rows = await harness.dataSource.query<
        Array<{ table_name: string }>
      >(
        `SELECT DISTINCT c.table_name
         FROM information_schema.columns c
        WHERE c.table_schema = $1
          AND c.column_name = 'tenant_id'
          AND (
            c.table_name LIKE 'cad\\_%' ESCAPE '\\'
            OR c.table_name IN ('sf_cad_blocks', 'design_blobs')
          )
        ORDER BY c.table_name`,
        [harness.schema],
      );
      return rows.map((r) => r.table_name);
    }

    /** Tablas del dominio CAD/design sin RLS activo o sin ninguna política. */
    async function tablesMissingRlsCoverage(): Promise<string[]> {
      const tables = await cadTenantTables();
      const missing: string[] = [];
      for (const table of tables) {
        const [{ relrowsecurity }] = await harness.dataSource.query<
          Array<{ relrowsecurity: boolean }>
        >(
          `SELECT c."relrowsecurity"
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relname = $2`,
          [harness.schema, table],
        );
        const policies = await harness.dataSource.query<unknown[]>(
          `SELECT 1 FROM pg_policies WHERE schemaname = $1 AND tablename = $2`,
          [harness.schema, table],
        );
        if (!relrowsecurity || policies.length === 0) missing.push(table);
      }
      return missing;
    }

    beforeAll(async () => {
      harness = await createPostgresHarness(allApplicationEntities(), {
        schemaPrefix: 'rls_coverage',
      });
    });

    afterAll(async () => {
      if (harness) await harness.destroy();
    });

    it('ANTES de las migraciones RLS, el escaneo SÍ detecta huecos (la herramienta funciona)', async () => {
      const missing = await tablesMissingRlsCoverage();
      // Todas las tablas CAD/design con tenant_id existen desde el arranque
      // (las entidades se sincronizan en el harness); ninguna tiene RLS aún.
      expect(missing.length).toBeGreaterThan(0);
      expect(missing).toEqual(expect.arrayContaining(['design_blobs']));
    });

    it('DESPUÉS de TenantIntegrityRls + TenantRuntimeRoleAndDesignBlobsRls, cero tablas CAD/design sin cobertura', async () => {
      await withRunner((runner) =>
        new TenantIntegrityRls20260820120000().up(runner),
      );
      await withRunner((runner) =>
        new TenantRuntimeRoleAndDesignBlobsRls20260823120000().up(runner),
      );
      await withRunner((runner) =>
        new CadPresenceBeatsRls20260831093000().up(runner),
      );

      expect(await tablesMissingRlsCoverage()).toEqual([]);

      // Y el conjunto detectado es EXACTAMENTE el esperado — ni de más ni de
      // menos, así que una tabla CAD nueva sin RLS vuelve a aparecer aquí en
      // rojo el día que exista, en vez de en un hallazgo de auditoría.
      expect(await cadTenantTables()).toEqual([
        'cad_comments',
        'cad_document_versions',
        'cad_documents',
        'cad_presence_beats',
        'cad_projects',
        'cad_publications',
        'cad_review_sessions',
        'cad_sheet_sets',
        'design_blobs',
        'sf_cad_blocks',
      ]);
    });

    it('una tabla CAD nueva sin política vuelve a aparecer en el escaneo (regresión simulada)', async () => {
      // Simula EXACTAMENTE lo que le pasó a design_blobs: una tabla nueva del
      // dominio CAD, con tenant_id, que nadie dio de alta en RLS_TABLES.
      await harness.dataSource.query(
        `CREATE TABLE "${harness.schema}"."cad_test_regresion" (
         "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         "tenant_id" varchar(36) NOT NULL
       )`,
      );
      try {
        expect(await tablesMissingRlsCoverage()).toEqual([
          'cad_test_regresion',
        ]);
      } finally {
        await harness.dataSource.query(
          `DROP TABLE "${harness.schema}"."cad_test_regresion"`,
        );
      }
    });

    it('deja constancia: fuera del dominio CAD/design hay tablas tenant SIN RLS (otro frente, no silencioso)', async () => {
      const rows = await harness.dataSource.query<
        Array<{ table_name: string }>
      >(
        `SELECT DISTINCT table_name
         FROM information_schema.columns
        WHERE table_schema = $1
          AND column_name IN ('tenant_id', 'organization_id')
          AND table_name NOT LIKE 'cad\\_%' ESCAPE '\\'
          AND table_name NOT IN ('sf_cad_blocks', 'design_blobs')
        ORDER BY table_name`,
        [harness.schema],
      );
      const outOfScopeTenantTables = rows.map((r) => r.table_name);
      // No es una aserción de "deben tener RLS" (fuera de scope de este
      // frente) — es una aserción de VISIBILIDAD: si este conjunto se reduce a
      // cero, hay que revisar si ya se cerró en otro frente y borrar esta nota;
      // si crece, alguien debe saber que la superficie sin RLS también creció.
      expect(outOfScopeTenantTables.length).toBeGreaterThan(0);
      // Nombres reales del esquema sincronizado por entidades hoy — no una
      // lista aspiracional. Si uno de estos deja de aparecer porque otro
      // frente ya lo puso bajo RLS, esta línea debe actualizarse para
      // reflejarlo (y celebrarlo), no relajarse a un `length > 0` sin nombres.
      expect(outOfScopeTenantTables).toEqual(
        expect.arrayContaining([
          'cfdi_receipts',
          'design_audit_log',
          'legal_acceptances',
        ]),
      );
    });

    it('probeRole no-dueño (SIN scope) no ve nada de ninguna tabla CAD/design tras el endurecimiento', async () => {
      const projectId = randomUUID();
      await harness.dataSource.query(
        `INSERT INTO "${harness.schema}"."cad_projects" ("id", "tenant_id", "name", "status")
       VALUES ($1, $2, 'sanity', 'active')`,
        [projectId, randomUUID()],
      );
      await withRunner(async (runner) => {
        await runner.query(`SET ROLE "valle_app"`);
        try {
          for (const table of await cadTenantTables()) {
            expect(
              await runner.query(`SELECT count(*)::int AS n FROM "${table}"`),
            ).toEqual([{ n: 0 }]);
          }
        } finally {
          await runner.query(`RESET ROLE`).catch(() => undefined);
          await runner.query(`RESET ALL`).catch(() => undefined);
        }
      });
    });
  },
);
