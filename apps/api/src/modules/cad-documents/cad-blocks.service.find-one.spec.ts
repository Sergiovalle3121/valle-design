import { randomUUID } from 'node:crypto';
import { DataSource, type Repository } from 'typeorm';
import {
  TenantContextService,
  type TenantContext,
} from '../../common/tenant/tenant-context.service';
import { CadBlocksService } from './cad-blocks.service';
import { SfCadBlock } from './entities/sf-cad-block.entity';
import { SYSTEM_CAD_BLOCK_PREFIX } from './system-cad-blocks';

/**
 * `CadBlocksService.findOne`: una fila por id, en el carril propio O en el de
 * sistema, sin cargar la biblioteca entera (hallazgo «GET /v1/cad/blocks/
 * :blockId loads the entire library»). Lo ajeno y lo huérfano (tenant NULL
 * sin llave de sistema) responden `null`, que el controlador vuelve 404.
 */

const context = (tenant: string | null): TenantContext => ({
  tenant_id: tenant,
  organization_id: null,
  plant_id: null,
  user_email: 'cad@test',
  role: null,
  permissions: null,
  scopes: null,
});

const definition = (id: string, name: string) => ({
  id,
  name,
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
});

describe('CadBlocksService.findOne — una fila, dos carriles', () => {
  let source: DataSource;
  let repository: Repository<SfCadBlock>;
  let tenant: TenantContextService;
  let service: CadBlocksService;

  beforeEach(async () => {
    source = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      dropSchema: true,
      synchronize: true,
      entities: [SfCadBlock],
    });
    await source.initialize();
    repository = source.getRepository(SfCadBlock);
    tenant = new TenantContextService();
    service = new CadBlocksService(repository, tenant);
  });

  afterEach(async () => source.destroy());

  it('devuelve el bloque propio con la misma proyección que la lista, sin listar la biblioteca', async () => {
    const created = await tenant.run(context('tenant-a'), () =>
      service.create({
        name: 'Puerta',
        definition: definition('puerta', 'Puerta'),
      }),
    );
    const [listed] = await tenant.run(context('tenant-a'), () =>
      service.list(),
    );

    const find = jest.spyOn(repository, 'find');
    const found = await tenant.run(context('tenant-a'), () =>
      service.findOne(created.id),
    );

    expect(found).toEqual(listed);
    expect(find).not.toHaveBeenCalled();
  });

  it('el bloque de OTRO inquilino y el id desconocido son null (404 en el controlador)', async () => {
    const created = await tenant.run(context('tenant-b'), () =>
      service.create({
        name: 'Ventana',
        definition: definition('ventana', 'Ventana'),
      }),
    );

    expect(
      await tenant.run(context('tenant-a'), () => service.findOne(created.id)),
    ).toBeNull();
    expect(
      await tenant.run(context('tenant-a'), () =>
        service.findOne(randomUUID()),
      ),
    ).toBeNull();
  });

  it('ve el carril de sistema, pero no una fila huérfana con tenant NULL sin llave de sistema', async () => {
    const system = await repository.save(
      repository.create({
        tenant_id: null,
        name: 'Puerta base',
        assets: [],
        definition: definition('puerta-base', 'Puerta base'),
        version: 1,
        legacySourceId: `${SYSTEM_CAD_BLOCK_PREFIX}puerta-base`,
      }),
    );
    const orphan = await repository.save(
      repository.create({
        tenant_id: null,
        name: 'Huérfano',
        assets: [],
        definition: definition('huerfano', 'Huérfano'),
        version: 1,
        legacySourceId: null,
      }),
    );

    expect(
      await tenant.run(context('tenant-a'), () => service.findOne(system.id)),
    ).toMatchObject({ id: system.id, name: 'Puerta base', version: 1 });
    expect(
      await tenant.run(context('tenant-a'), () => service.findOne(orphan.id)),
    ).toBeNull();
  });
});
