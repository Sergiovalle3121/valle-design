import { randomBytes, randomUUID } from 'node:crypto';
import {
  allApplicationEntities,
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../common/testing/postgres-harness';
import { TenantIntegrityRls20260820120000 } from './20260820120000-TenantIntegrityRls';

/**
 * La póliza se prueba donde vive: en PostgreSQL, con un rol NO dueño.
 *
 * Lo que hay que demostrar no es que la política exista — es que una query
 * SIN scope de aplicación NO devuelve filas de otro tenant, que el carril de
 * sistema de `sf_cad_blocks` sigue siendo legible pero no escribible, y que
 * el pre-check aborta sin mutar nada cuando aún hay filas huérfanas. El rol
 * probe es la pieza clave: el dueño de las tablas (y cualquier superusuario)
 * BYPASEA RLS sin FORCE — ese bypass es deliberado (la app de hoy) y también
 * queda afirmado aquí para que nadie lo descubra en producción.
 */
describePostgres('TenantIntegrityRls (RLS real, rol no dueño)', () => {
  jest.setTimeout(120_000);

  let harness: PostgresHarness;
  const probeRole = `rls_probe_${randomBytes(4).toString('hex')}`;
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const projectA = randomUUID();
  const projectB = randomUUID();

  async function run(direction: 'up' | 'down'): Promise<void> {
    const migration = new TenantIntegrityRls20260820120000();
    const runner = harness.dataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.query(`SET search_path TO "${harness.schema}"`);
      await migration[direction](runner);
    } finally {
      await runner.release();
    }
  }

  function tenantNullability(): Promise<Array<{ is_nullable: string }>> {
    return harness.dataSource.query(
      `SELECT "is_nullable" FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'cad_projects'
          AND column_name = 'tenant_id'`,
      [harness.schema],
    );
  }

  function rowSecurity(table: string): Promise<Array<{ relrowsecurity: boolean }>> {
    return harness.dataSource.query(
      `SELECT c."relrowsecurity"
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2`,
      [harness.schema, table],
    );
  }

  beforeAll(async () => {
    harness = await createPostgresHarness(allApplicationEntities(), {
      schemaPrefix: 'tenant_rls',
    });
  });

  afterAll(async () => {
    if (harness) {
      await harness.dataSource
        .query(`DROP OWNED BY "${probeRole}"`)
        .catch(() => undefined);
      await harness.dataSource
        .query(`DROP ROLE IF EXISTS "${probeRole}"`)
        .catch(() => undefined);
      await harness.destroy();
    }
  });

  it('el pre-check aborta ante filas huérfanas SIN mutar nada', async () => {
    await harness.dataSource.query(
      `INSERT INTO "${harness.schema}"."cad_projects" ("id", "tenant_id", "name", "status")
       VALUES ($1, NULL, 'huérfano', 'active')`,
      [randomUUID()],
    );

    await expect(run('up')).rejects.toThrow(/tenant_id NULL/u);

    // Nada cambió: la columna sigue nullable y RLS sigue apagado.
    expect(await tenantNullability()).toEqual([{ is_nullable: 'YES' }]);
    expect(await rowSecurity('cad_projects')).toEqual([
      { relrowsecurity: false },
    ]);
  });

  it('adoptadas las filas, up endurece las 7 tablas y enciende RLS en las 8', async () => {
    await harness.dataSource.query(
      `UPDATE "${harness.schema}"."cad_projects" SET "tenant_id" = $1
        WHERE "tenant_id" IS NULL`,
      [tenantA],
    );

    await run('up');

    const notNullTables = await harness.dataSource.query(
      `SELECT table_name FROM information_schema.columns
        WHERE table_schema = $1 AND column_name = 'tenant_id'
          AND is_nullable = 'NO'
        ORDER BY table_name`,
      [harness.schema],
    );
    expect(notNullTables.map((r: { table_name: string }) => r.table_name)).toEqual(
      expect.arrayContaining([
        'cad_comments',
        'cad_document_versions',
        'cad_documents',
        'cad_projects',
        'cad_publications',
        'cad_review_sessions',
        'cad_sheet_sets',
      ]),
    );
    // La biblioteca de sistema conserva su carril NULL…
    expect(
      notNullTables.map((r: { table_name: string }) => r.table_name),
    ).not.toContain('sf_cad_blocks');
    // …pero también quedó bajo RLS.
    expect(await rowSecurity('sf_cad_blocks')).toEqual([
      { relrowsecurity: true },
    ]);
    expect(await rowSecurity('cad_documents')).toEqual([
      { relrowsecurity: true },
    ]);

    // Y el carril NULL en las 7 endurecidas ahora es IMPOSIBLE.
    await expect(
      harness.dataSource.query(
        `INSERT INTO "${harness.schema}"."cad_projects" ("id", "tenant_id", "name", "status")
         VALUES ($1, NULL, 'imposible', 'active')`,
        [randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23502' });
  });

  it('una query SIN scope no devuelve filas de NINGÚN tenant (rol no dueño)', async () => {
    // Estado limpio (el dueño bypasea RLS: puede barrer lo del test anterior,
    // incluida la fila adoptada) y datos de dos despachos.
    await harness.dataSource.query(
      `DELETE FROM "${harness.schema}"."cad_projects"`,
    );
    await harness.dataSource.query(
      `INSERT INTO "${harness.schema}"."cad_projects" ("id", "tenant_id", "name", "status")
       VALUES ($1, $2, 'Plano A', 'active'), ($3, $4, 'Plano B', 'active')`,
      [projectA, tenantA, projectB, tenantB],
    );
    // Un bloque de SISTEMA y un bloque del tenant A.
    await harness.dataSource.query(
      `INSERT INTO "${harness.schema}"."sf_cad_blocks" ("id", "tenant_id", "name", "assets")
       VALUES ($1, NULL, 'sistema:puerta', '[]'::jsonb), ($2, $3, 'privado-a', '[]'::jsonb)`,
      [randomUUID(), randomUUID(), tenantA],
    );

    await harness.dataSource.query(`CREATE ROLE "${probeRole}" NOLOGIN`);
    await harness.dataSource.query(
      `GRANT USAGE ON SCHEMA "${harness.schema}" TO "${probeRole}"`,
    );
    await harness.dataSource.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${harness.schema}" TO "${probeRole}"`,
    );

    // Una sola conexión: SET ROLE y set_config viven por sesión.
    const runner = harness.dataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.query(`SET search_path TO "${harness.schema}"`);
      await runner.query(`SET ROLE "${probeRole}"`);

      // SIN scope: cerrado por defecto. Ni A ni B.
      expect(
        await runner.query(`SELECT count(*)::int AS n FROM "cad_projects"`),
      ).toEqual([{ n: 0 }]);

      // Con scope del tenant A: exactamente lo de A.
      await runner.query(`SELECT set_config('app.tenant_id', $1, false)`, [
        tenantA,
      ]);
      expect(
        await runner.query(`SELECT "id" FROM "cad_projects"`),
      ).toEqual([{ id: projectA }]);

      // El scope de B no ve lo de A.
      await runner.query(`SELECT set_config('app.tenant_id', $1, false)`, [
        tenantB,
      ]);
      expect(
        await runner.query(`SELECT "id" FROM "cad_projects"`),
      ).toEqual([{ id: projectB }]);

      // Escribir en el tenant ajeno viola la política (42501), no un WHERE.
      await expect(
        runner.query(
          `INSERT INTO "cad_projects" ("id", "tenant_id", "name", "status")
           VALUES ($1, $2, 'intruso', 'active')`,
          [randomUUID(), tenantA],
        ),
      ).rejects.toMatchObject({ driverError: expect.objectContaining({ code: '42501' }) });

      // La biblioteca de sistema: legible por cualquier tenant…
      expect(
        await runner.query(
          `SELECT "name" FROM "sf_cad_blocks" ORDER BY "name"`,
        ),
      ).toEqual([{ name: 'sistema:puerta' }]);
      // …e inviolable: el carril NULL no admite escrituras de tenants.
      await expect(
        runner.query(
          `INSERT INTO "sf_cad_blocks" ("id", "tenant_id", "name", "assets")
           VALUES ($1, NULL, 'troyano', '[]'::jsonb)`,
          [randomUUID()],
        ),
      ).rejects.toMatchObject({ driverError: expect.objectContaining({ code: '42501' }) });

    } finally {
      // En el finally: si una aserción intermedia falla, la conexión vuelve
      // al pool SIN el rol probe ni el scope pegados — un rol filtrado
      // convierte cada test posterior en un falso rojo de permisos.
      await runner.query(`RESET ROLE`).catch(() => undefined);
      await runner.query(`RESET ALL`).catch(() => undefined);
      await runner.release();
    }
  });

  it('el dueño de las tablas sigue sin sujetarse (decisión deliberada, sin FORCE)', async () => {
    // La aplicación de hoy corre como dueño: su comportamiento no cambia. El
    // día que corra con rol runtime no-dueño (DEPLOYMENT.md), quedará sujeta.
    const rows = await harness.dataSource.query(
      `SELECT count(*)::int AS n FROM "${harness.schema}"."cad_projects"`,
    );
    expect(rows).toEqual([{ n: 2 }]);
  });

  it('down restaura NULLABLE y apaga RLS (reversibilidad completa)', async () => {
    await run('down');

    expect(await tenantNullability()).toEqual([{ is_nullable: 'YES' }]);
    expect(await rowSecurity('cad_projects')).toEqual([
      { relrowsecurity: false },
    ]);
    expect(await rowSecurity('sf_cad_blocks')).toEqual([
      { relrowsecurity: false },
    ]);

    // El carril NULL vuelve a ser posible tras el down.
    await expect(
      harness.dataSource.query(
        `INSERT INTO "${harness.schema}"."cad_projects" ("id", "tenant_id", "name", "status")
         VALUES ($1, NULL, 'legacy-lane', 'active')`,
        [randomUUID()],
      ),
    ).resolves.toBeDefined();

    // Y up vuelve a abortar por ella: el pre-check no era de una sola vez.
    await expect(run('up')).rejects.toThrow(/tenant_id NULL/u);
    await harness.dataSource.query(
      `DELETE FROM "${harness.schema}"."cad_projects" WHERE "tenant_id" IS NULL`,
    );
    await run('up');
    expect(await rowSecurity('cad_projects')).toEqual([
      { relrowsecurity: true },
    ]);
  });
});
