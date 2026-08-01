import { ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  TenantContextService,
  type TenantContext,
} from '../../common/tenant/tenant-context.service';
import { createTenantScopedRepository } from '../../common/tenant/tenant-scoped.repository';
import { DatabaseBlobStore } from './design-blob.store';
import { DesignBlob } from './entities/design-blob.entity';

const context = (tenant: string): TenantContext => ({
  tenant_id: tenant,
  organization_id: null,
  plant_id: null,
  user_email: 'cad@test',
  role: null,
  permissions: null,
  scopes: null,
});

const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex');

describe('DatabaseBlobStore (design_blobs)', () => {
  let source: DataSource;
  let tenant: TenantContextService;
  let store: DatabaseBlobStore;

  beforeEach(async () => {
    source = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      dropSchema: true,
      synchronize: true,
      entities: [DesignBlob],
    });
    await source.initialize();
    tenant = new TenantContextService();
    store = new DatabaseBlobStore(
      createTenantScopedRepository(DesignBlob, source.manager, tenant, {
        strict: true,
      }),
      tenant,
    );
  });

  afterEach(async () => source.destroy());

  it('deduplica por sha256: el mismo contenido dos veces es la MISMA blobKey', async () => {
    const data = Buffer.from('cad-archive-gzip-bytes');
    const digest = sha(data);
    const [first, second] = await tenant.run(context('tenant-a'), async () => {
      const a = await store.put(data, digest);
      const b = await store.put(data, digest);
      return [a, b];
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.blobKey).toBe(first.blobKey);
    expect(second.sha256).toBe(digest);
    expect(second.size).toBe(data.length);
    expect(await source.getRepository(DesignBlob).count()).toBe(1);

    const roundTrip = await tenant.run(context('tenant-a'), () =>
      store.get(first.blobKey),
    );
    expect(Buffer.from(roundTrip)).toEqual(data);
  });

  it('una colisión de hash (mismo sha256, distinto tamaño) es un 409 explícito', async () => {
    const data = Buffer.from('original');
    const digest = sha(data);
    await tenant.run(context('tenant-a'), () => store.put(data, digest));
    await expect(
      tenant.run(context('tenant-a'), () =>
        store.put(Buffer.from('otra-cosa-mas-larga'), digest),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('el mismo contenido en OTRO tenant es OTRO blob (aislamiento)', async () => {
    const data = Buffer.from('compartido');
    const digest = sha(data);
    const a = await tenant.run(context('tenant-a'), () =>
      store.put(data, digest),
    );
    const b = await tenant.run(context('tenant-b'), () =>
      store.put(data, digest),
    );
    expect(b.blobKey).not.toBe(a.blobKey);
    // Y el blob de A no es legible desde B.
    await expect(
      tenant.run(context('tenant-b'), () => store.get(a.blobKey)),
    ).rejects.toThrow(NotFoundException);
  });

  it('put sin tenant en contexto falla cerrado (nunca blobs sin dueño)', async () => {
    const data = Buffer.from('sin-tenant');
    await expect(store.put(data, sha(data))).rejects.toThrow(
      /tenant en el contexto/,
    );
  });

  it('GC en dos barridos: delete exige marca previa y re-put resucita', async () => {
    const data = Buffer.from('huerfano');
    const digest = sha(data);
    await tenant.run(context('tenant-a'), async () => {
      const { blobKey } = await store.put(data, digest);

      // Borrar sin marca → 409 fail-closed.
      await expect(store.delete(blobKey)).rejects.toThrow(ConflictException);

      // Marcar y comprobar la marca.
      await store.markForGc(blobKey);
      expect((await store.head(blobKey)).gcMarkedAt).not.toBeNull();

      // Re-subir el mismo contenido LIMPIA la marca (blob referenciado vive).
      const revived = await store.put(data, digest);
      expect(revived.blobKey).toBe(blobKey);
      expect((await store.head(blobKey)).gcMarkedAt).toBeNull();

      // Marcado de nuevo, el segundo barrido sí borra.
      await store.markForGc(blobKey);
      await store.delete(blobKey);
      await expect(store.get(blobKey)).rejects.toThrow(NotFoundException);
    });
  });
});
