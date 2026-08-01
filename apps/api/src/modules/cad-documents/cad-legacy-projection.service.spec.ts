import { DataSource } from 'typeorm';
import { CadLegacyProjectionService } from './cad-legacy-projection.service';
import { CadDocument } from './entities/cad-document.entity';
import { CadDocumentVersion } from './entities/cad-document-version.entity';
import {
  TenantContext,
  TenantContextService,
} from '../../common/tenant/tenant-context.service';
import { createTenantScopedRepository } from '../../common/tenant/tenant-scoped.repository';

function ctxFor(tenant: string | null): TenantContext {
  return {
    tenant_id: tenant,
    organization_id: null,
    plant_id: null,
    user_email: 'cad@test',
    role: null,
    permissions: null,
    scopes: null,
  };
}

const doc = (version: number, extra: Record<string, unknown> = {}) => ({
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
  ...extra,
});

describe('CadLegacyProjectionService', () => {
  let dataSource: DataSource;
  let ctx: TenantContextService;
  let service: CadLegacyProjectionService;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      dropSchema: true,
      synchronize: true,
      entities: [CadDocument, CadDocumentVersion],
    });
    await dataSource.initialize();
    ctx = new TenantContextService();
    service = new CadLegacyProjectionService(
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
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  const layoutFor = (
    overrides: Partial<
      Parameters<CadLegacyProjectionService['projectFromLegacyLayout']>[0]
    > = {},
  ) => ({
    id: 'layout-1',
    tenantId: 'T_CAD',
    model: 'AX-9',
    revision: 'A',
    cadDocument: doc(1) as Record<string, unknown>,
    cadDocumentVersion: 1,
    layers: [{ id: 'l1', name: 'Capa 1', color: '#fff' }],
    ...overrides,
  });

  it('proyecta un documento nuevo: upsert por (tenant, legacy_source_id) + historial', async () => {
    await ctx.run(ctxFor('T_CAD'), async () => {
      const result = await service.projectFromLegacyLayout(layoutFor());
      expect(result).toMatchObject({
        status: 'projected',
        version: 1,
        versionRecorded: true,
      });

      const rows = await dataSource.getRepository(CadDocument).find();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        tenant_id: 'T_CAD',
        legacySourceId: 'layout-1',
        name: 'AX-9 A',
        model: 'AX-9',
        revision: 'A',
        cadDocumentVersion: 1,
      });
      expect(rows[0].cadDocument).toEqual(doc(1));
      expect(rows[0].layers).toEqual([
        { id: 'l1', name: 'Capa 1', color: '#fff' },
      ]);

      const versions = await dataSource
        .getRepository(CadDocumentVersion)
        .find();
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({
        documentId: rows[0].id,
        version: 1,
        tenant_id: 'T_CAD',
      });
      expect(versions[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  it('re-proyección idempotente: la misma versión no duplica documento ni historial', async () => {
    await ctx.run(ctxFor('T_CAD'), async () => {
      const first = await service.projectFromLegacyLayout(layoutFor());
      const second = await service.projectFromLegacyLayout(layoutFor());
      expect(first).toMatchObject({ status: 'projected', version: 1 });
      expect(second).toMatchObject({
        status: 'projected',
        version: 1,
        versionRecorded: false,
      });

      expect(await dataSource.getRepository(CadDocument).count()).toBe(1);
      expect(await dataSource.getRepository(CadDocumentVersion).count()).toBe(
        1,
      );
    });
  });

  it('una versión menor NUNCA retrocede la fila proyectada', async () => {
    await ctx.run(ctxFor('T_CAD'), async () => {
      await service.projectFromLegacyLayout(
        layoutFor({ cadDocument: doc(3), cadDocumentVersion: 3 }),
      );
      const stale = await service.projectFromLegacyLayout(
        layoutFor({ cadDocument: doc(2), cadDocumentVersion: 2 }),
      );
      expect(stale).toEqual({
        status: 'skipped',
        reason: 'version_anterior',
      });

      const row = await dataSource
        .getRepository(CadDocument)
        .findOneByOrFail({ legacySourceId: 'layout-1' });
      expect(row.cadDocumentVersion).toBe(3);
      expect(row.cadDocument).toEqual(doc(3));
      // El rechazo tampoco inventa historial.
      expect(await dataSource.getRepository(CadDocumentVersion).count()).toBe(
        1,
      );
    });
  });

  it('una versión mayor actualiza el documento y agrega su fila de historial', async () => {
    await ctx.run(ctxFor('T_CAD'), async () => {
      await service.projectFromLegacyLayout(layoutFor());
      const result = await service.projectFromLegacyLayout(
        layoutFor({
          cadDocument: doc(2),
          cadDocumentVersion: 2,
          revision: 'B',
          layers: null,
        }),
      );
      expect(result).toMatchObject({
        status: 'projected',
        version: 2,
        versionRecorded: true,
      });

      const rows = await dataSource.getRepository(CadDocument).find();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        cadDocumentVersion: 2,
        name: 'AX-9 B',
        revision: 'B',
      });
      expect(rows[0].cadDocument).toEqual(doc(2));

      const versions = await dataSource
        .getRepository(CadDocumentVersion)
        .find({ order: { version: 'ASC' } });
      expect(versions.map((v) => v.version)).toEqual([1, 2]);
    });
  });

  it('un layout sin cadDocument no proyecta nada', async () => {
    await ctx.run(ctxFor('T_CAD'), async () => {
      const result = await service.projectFromLegacyLayout(
        layoutFor({ cadDocument: null }),
      );
      expect(result).toEqual({ status: 'skipped', reason: 'sin_documento' });
      expect(await dataSource.getRepository(CadDocument).count()).toBe(0);
      expect(await dataSource.getRepository(CadDocumentVersion).count()).toBe(
        0,
      );
    });
  });

  it('un puntero a blob se copia tal cual y el historial toma su sha256 del manifiesto', async () => {
    const sha = 'a'.repeat(64);
    const pointer = {
      _storage: {
        kind: 'document_blob',
        version: 1,
        blobKey: 'blob-key-1',
        sha256: sha,
        encoding: 'gzip',
        compressedBytes: 10,
        uncompressedBytes: 20,
      },
      summary: { schema: 3, contentVersion: 4, entityCount: 2 },
    };
    await ctx.run(ctxFor('T_CAD'), async () => {
      await service.projectFromLegacyLayout(
        layoutFor({ cadDocument: pointer, cadDocumentVersion: 4 }),
      );
      const row = await dataSource
        .getRepository(CadDocument)
        .findOneByOrFail({ legacySourceId: 'layout-1' });
      // El puntero se copia tal cual — jamás se duplican bytes del blob.
      expect(row.cadDocument).toEqual(pointer);
      const version = await dataSource
        .getRepository(CadDocumentVersion)
        .findOneByOrFail({ documentId: row.id, version: 4 });
      expect(version.sha256).toBe(sha);
    });
  });

  it('el mismo legacy id en dos tenants proyecta filas separadas (lane por tenant)', async () => {
    await ctx.run(ctxFor('T_A'), () =>
      service.projectFromLegacyLayout(layoutFor({ tenantId: 'T_A' })),
    );
    await ctx.run(ctxFor('T_B'), () =>
      service.projectFromLegacyLayout(layoutFor({ tenantId: 'T_B' })),
    );
    const rows = await dataSource.getRepository(CadDocument).find();
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.tenant_id))).toEqual(
      new Set(['T_A', 'T_B']),
    );
  });
});
