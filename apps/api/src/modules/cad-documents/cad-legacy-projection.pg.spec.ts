import { DataSource } from 'typeorm';
import { CadLegacyProjectionService } from './cad-legacy-projection.service';
import { CadProject } from './entities/cad-project.entity';
import { CadDocument } from './entities/cad-document.entity';
import { CadDocumentVersion } from './entities/cad-document-version.entity';
import { CadPublication } from './entities/cad-publication.entity';
import { CadReviewSession } from './entities/cad-review-session.entity';
import { CadComment } from './entities/cad-comment.entity';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { createTenantScopedRepository } from '../../common/tenant/tenant-scoped.repository';
import {
  PostgresHarness,
  createPostgresHarness,
  describePostgres,
} from '../../common/testing/postgres-harness';

/**
 * PROYECCIÓN DE COMPATIBILIDAD CAD (PostgreSQL real).
 *
 * El upsert por (tenant, legacy_source_id) se defiende con índices únicos
 * PARCIALES y un UPDATE condicional monótono — exactamente el terreno que
 * SQLite no ejerce (serializa toda escritura) y los mocks afirman en vez de
 * probar. Aquí se demuestra sobre las entidades cad_* nuevas:
 *  - dos primeras proyecciones CONCURRENTES del mismo layout → UNA fila (el
 *    índice parcial arbitra, el perdedor degrada a update);
 *  - re-proyección idempotente y guard monótono (nunca retrocede);
 *  - lane de sistema (tenant NULL) protegido por su propio índice parcial.
 */
describePostgres(
  'CadLegacyProjectionService — upsert real (PostgreSQL)',
  () => {
    jest.setTimeout(60_000);

    let harness: PostgresHarness;
    let dataSource: DataSource;

    const doc = (version: number) => ({
      meta: { version, schema: 3, unit: 'mm' },
      entities: [
        {
          id: `line-${version}`,
          type: 'line',
          start: { x: 0, y: 0, z: 0 },
          end: { x: 1000 * version, y: 0, z: 0 },
          layer: 'A-WALL',
        },
      ],
    });

    const buildService = (tenant: string | null) => {
      const ctx = new TenantContextService();
      ctx.getTenantId = () => tenant;
      ctx.getPlantId = () => null;
      ctx.getUserEmail = () => 'cad@acme.example';
      return new CadLegacyProjectionService(
        createTenantScopedRepository(CadDocument, dataSource.manager, ctx, {
          strict: true,
        }),
        createTenantScopedRepository(
          CadDocumentVersion,
          dataSource.manager,
          ctx,
          { strict: true },
        ),
      );
    };

    const layoutFor = (
      tenant: string | null,
      version: number,
      overrides: Record<string, unknown> = {},
    ) => ({
      id: 'layout-pg-1',
      tenantId: tenant,
      model: 'AX-9',
      revision: 'A',
      cadDocument: doc(version) as Record<string, unknown>,
      cadDocumentVersion: version,
      layers: [{ id: 'l1', name: 'Capa 1', color: '#fff' }],
      ...overrides,
    });

    beforeAll(async () => {
      harness = await createPostgresHarness(
        [
          CadProject,
          CadDocument,
          CadDocumentVersion,
          CadPublication,
          CadReviewSession,
          CadComment,
        ],
        { schemaPrefix: 'cadproj' },
      );
      dataSource = harness.dataSource;
    });

    beforeEach(async () => {
      await harness.truncateAll();
    });

    afterAll(async () => {
      await harness.destroy();
    });

    it('proyecta, re-proyecta idempotente y nunca retrocede (guard SQL monótono)', async () => {
      const service = buildService('T_PG');

      const first = await service.projectFromLegacyLayout(layoutFor('T_PG', 1));
      expect(first).toMatchObject({
        status: 'projected',
        version: 1,
        versionRecorded: true,
      });

      // Idempotente: misma versión → mismo documento, sin duplicar historial.
      const again = await service.projectFromLegacyLayout(layoutFor('T_PG', 1));
      expect(again).toMatchObject({
        status: 'projected',
        version: 1,
        versionRecorded: false,
      });

      // Avanza y registra la nueva versión.
      const upgraded = await service.projectFromLegacyLayout(
        layoutFor('T_PG', 2),
      );
      expect(upgraded).toMatchObject({
        status: 'projected',
        version: 2,
        versionRecorded: true,
      });

      // Una versión menor tardía no retrocede la fila proyectada.
      const stale = await service.projectFromLegacyLayout(layoutFor('T_PG', 1));
      expect(stale).toEqual({ status: 'skipped', reason: 'version_anterior' });

      const rows = await dataSource.getRepository(CadDocument).find();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        tenant_id: 'T_PG',
        legacySourceId: 'layout-pg-1',
        cadDocumentVersion: 2,
      });
      expect(rows[0].cadDocument).toEqual(doc(2));
      const versions = await dataSource
        .getRepository(CadDocumentVersion)
        .find({ order: { version: 'ASC' } });
      expect(versions.map((v) => v.version)).toEqual([1, 2]);
    });

    it('dos primeras proyecciones CONCURRENTES del mismo layout dejan UNA sola fila', async () => {
      const service = buildService('T_PG');

      const results = await Promise.all([
        service.projectFromLegacyLayout(layoutFor('T_PG', 1)),
        service.projectFromLegacyLayout(layoutFor('T_PG', 1)),
      ]);
      expect(results.map((r) => r.status)).toEqual(['projected', 'projected']);

      // El índice único parcial (tenant, legacy_source_id) arbitró la carrera.
      expect(await dataSource.getRepository(CadDocument).count()).toBe(1);
      expect(await dataSource.getRepository(CadDocumentVersion).count()).toBe(
        1,
      );
    });

    it('el lane de sistema (tenant NULL) también es idempotente — índice parcial propio', async () => {
      const service = buildService(null);

      await Promise.all([
        service.projectFromLegacyLayout(layoutFor(null, 1)),
        service.projectFromLegacyLayout(layoutFor(null, 1)),
      ]);
      await service.projectFromLegacyLayout(layoutFor(null, 2));

      const rows = await dataSource.getRepository(CadDocument).find();
      expect(rows).toHaveLength(1);
      expect(rows[0].tenant_id).toBeNull();
      expect(rows[0].cadDocumentVersion).toBe(2);
    });

    it('el mismo legacy id en otro tenant es una fila independiente (aislamiento)', async () => {
      await buildService('T_A').projectFromLegacyLayout(layoutFor('T_A', 1));
      await buildService('T_B').projectFromLegacyLayout(layoutFor('T_B', 5));

      const rows = await dataSource
        .getRepository(CadDocument)
        .find({ order: { tenant_id: 'ASC' } });
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => [r.tenant_id, r.cadDocumentVersion])).toEqual([
        ['T_A', 1],
        ['T_B', 5],
      ]);
    });
  },
);
