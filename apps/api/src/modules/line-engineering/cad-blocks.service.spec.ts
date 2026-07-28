import { DataSource } from 'typeorm';
import {
  TenantContextService,
  type TenantContext,
} from '../../common/tenant/tenant-context.service';
import { CadBlocksService } from './cad-blocks.service';
import { SfCadBlock } from './entities/sf-cad-block.entity';

const context = (tenant: string): TenantContext => ({
  tenant_id: tenant,
  organization_id: null,
  plant_id: null,
  user_email: 'cad@test',
  role: null,
  permissions: null,
  scopes: null,
});
const definition = (id: string, name: string, description: string) => ({
  id,
  name,
  description,
  keywords: ['safety', 'door'],
  version: 1,
  basePoint: { x: 0, y: 0, z: 0 },
  entities: [
    {
      id: `${id}:line`,
      type: 'line',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 10, y: 0, z: 0 },
      layer: '0',
    },
  ],
  thumbnail: { svg: '<svg viewBox="0 0 10 10"><path d="M0 0L10 0"/></svg>' },
  businessLink: { entityType: 'assetType', entityId: id },
});

describe('CadBlocksService professional tenant library', () => {
  let source: DataSource;
  let tenant: TenantContextService;
  let service: CadBlocksService;

  beforeEach(async () => {
    source = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      dropSchema: true,
      synchronize: true,
      entities: [SfCadBlock],
    });
    await source.initialize();
    tenant = new TenantContextService();
    service = new CadBlocksService(source.getRepository(SfCadBlock), tenant);
  });

  afterEach(async () => source.destroy());

  it('isolates, searches and versions canonical definitions', async () => {
    const created = await tenant.run(context('tenant-a'), () =>
      service.create(
        {
          name: 'Safety Door',
          definition: definition('door', 'Safety Door', 'Steel fire exit'),
        },
        'cad@test',
      ),
    );
    await tenant.run(context('tenant-b'), () =>
      service.create(
        {
          name: 'Robot',
          definition: definition('robot', 'Robot', 'Assembly cobot'),
        },
        'cad@test',
      ),
    );
    const search = await tenant.run(context('tenant-a'), () =>
      service.list('steel safety'),
    );
    expect(search).toHaveLength(1);
    expect(search[0].definition?.thumbnail).toBeDefined();
    expect(
      await tenant.run(context('tenant-b'), () => service.list('steel')),
    ).toHaveLength(0);
    const updated = await tenant.run(context('tenant-a'), () =>
      service.update(created.id, {
        definition: {
          ...definition('door', 'Safety Door', 'Steel fire exit v2'),
          version: 2,
        },
      }),
    );
    expect(updated.version).toBe(2);
    expect(
      (updated.definition as { description: string }).description,
    ).toContain('v2');
    await expect(
      tenant.run(context('tenant-b'), () =>
        service.update(created.id, { name: 'Forbidden' }),
      ),
    ).rejects.toThrow('Bloque no encontrado');
  });

  it('rejects unbounded or malformed canonical payloads', async () => {
    await expect(
      tenant.run(context('tenant-a'), () =>
        service.create({
          name: 'Empty',
          definition: {
            id: 'empty',
            name: 'Empty',
            basePoint: {},
            entities: [],
          },
        }),
      ),
    ).rejects.toThrow('al menos una entidad');
    await expect(
      tenant.run(context('tenant-a'), () =>
        service.create({
          name: 'Huge',
          definition: { ...definition('huge', 'Huge', 'x'.repeat(1_100_000)) },
        }),
      ),
    ).rejects.toThrow('supera 1 MB');
  });
});
