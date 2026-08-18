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
      type: 'better-sqlite3',
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

  /**
   * El carril de sistema: los bloques arquitectónicos que siembra la migración
   * viven con `tenant_id IS NULL` y llave `valle:arq:…`. Sin estas dos
   * propiedades el sembrado no sirve de nada — una biblioteca que la migración
   * llena pero que ningún inquilino ve es la misma biblioteca vacía de antes—,
   * y sin la tercera cualquiera podría borrarles la puerta a todos los demás.
   */
  describe('biblioteca base del producto', () => {
    const sembrarPuerta = () =>
      source.getRepository(SfCadBlock).save(
        source.getRepository(SfCadBlock).create({
          tenant_id: null,
          name: 'Puerta abatible 0.90 m',
          assets: [],
          definition: definition(
            'valle:arq:puerta-abatible-90',
            'Puerta abatible 0.90 m',
            'Puerta de acceso',
          ),
          version: 1,
          legacySourceId: 'valle:arq:puerta-abatible-90',
        }),
      );

    it('la ve cualquier inquilino junto a sus propios bloques', async () => {
      await sembrarPuerta();
      await tenant.run(context('tenant-a'), () =>
        service.create(
          { name: 'Mi celda', definition: definition('mia', 'Mi celda', 'x') },
          'cad@test',
        ),
      );

      const listado = await tenant.run(context('tenant-a'), () =>
        service.list(),
      );
      expect(listado.map((row) => row.name).sort()).toEqual([
        'Mi celda',
        'Puerta abatible 0.90 m',
      ]);
      // Y también el inquilino que no ha creado nada: la puerta no es de nadie
      // en particular, es del producto.
      expect(
        await tenant.run(context('tenant-b'), () => service.list()),
      ).toHaveLength(1);
    });

    it('no se lista dos veces cuando la sesión no trae inquilino', async () => {
      await sembrarPuerta();
      // Sin inquilino, el carril propio Y el de sistema son el mismo: si se
      // consultaran los dos, cada bloque de fábrica saldría duplicado.
      expect(await service.list()).toHaveLength(1);
    });

    it('es de sólo lectura: no se redefine ni se borra', async () => {
      const sembrada = await sembrarPuerta();
      const intentos: Array<() => Promise<unknown>> = [
        () => service.update(sembrada.id, { name: 'Mi puerta' }),
        () => service.remove(sembrada.id),
      ];
      for (const intento of intentos)
        await expect(tenant.run(context('tenant-a'), intento)).rejects.toThrow(
          'sólo lectura',
        );
      // Y tampoco desde una sesión sin inquilino, que es donde `tenant_id IS
      // NULL` dejaría de distinguir lo del producto de lo propio.
      await expect(service.remove(sembrada.id)).rejects.toThrow('sólo lectura');
    });
  });
});
