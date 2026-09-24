import { gzipSync } from 'node:zlib';
import { HttpException, UnauthorizedException } from '@nestjs/common';
import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import type { ApiRateLimitService } from '../identity/api-rate-limit.service';
import {
  CadDemoShareService,
  DEMO_SHARE_MAX_GZIP_BYTES,
  hashDemoShareToken,
} from './cad-demo-share.service';
import { CadDemoShare } from './entities/cad-demo-share.entity';

/**
 * EL ENLACE TEMPORAL DE LA DEMOSTRACIÓN, CONTRA PostgreSQL REAL.
 *
 * Lo que defiende: que el visitante sin cuenta pueda mandar su plano a un
 * celular, y que esa superficie anónima no pueda convertirse en otra cosa —
 * sólo se guardan hashes, la copia caduca y se borra, y lo que no hace falta
 * para mirar un plano no se guarda.
 */
describePostgres('enlace temporal de la demostración (PostgreSQL real)', () => {
  jest.setTimeout(60_000);

  let harness: PostgresHarness;
  let service: CadDemoShareService;
  const enforce = jest.fn(async () => undefined);
  const IP = '203.0.113.7';

  const plano = (extra: Record<string, unknown> = {}) => ({
    meta: { schema: 3, version: 1, unit: 'mm' },
    entities: [
      {
        id: 'muro-sur',
        type: 'line',
        start: { x: 0, y: 0, z: 0 },
        end: { x: 4_000, y: 0, z: 0 },
        layer: '0',
      },
    ],
    blocks: [],
    constraints: [],
    ...extra,
  });
  const gz = (value: unknown) => gzipSync(Buffer.from(JSON.stringify(value)));

  beforeAll(async () => {
    harness = await createPostgresHarness([CadDemoShare], {
      schemaPrefix: 'cad_demo_share',
    });
    service = new CadDemoShareService(
      harness.dataSource.getRepository(CadDemoShare),
      { enforce } as unknown as ApiRateLimitService,
    );
  });

  afterAll(async () => {
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    await harness.truncateAll();
    enforce.mockClear();
    delete process.env.CAD_DEMO_SHARES_ENABLED;
  });

  it('crea, canjea y borra: sólo los hashes llegan a la base', async () => {
    const creado = await service.create(gz(plano()), '  Casa  de  prueba ', IP);
    expect(creado.shareToken).toMatch(/^vdds_/u);
    expect(creado.manageToken).toMatch(/^vddm_/u);
    expect(new Date(creado.expiresAt).getTime() - Date.now()).toBeGreaterThan(
      6.9 * 24 * 60 * 60 * 1000,
    );

    const filas = await harness.dataSource
      .getRepository(CadDemoShare)
      .createQueryBuilder('share')
      .addSelect('share.documentGzip')
      .getMany();
    expect(filas).toHaveLength(1);
    expect(filas[0].tokenHash).toBe(hashDemoShareToken(creado.shareToken));
    expect(filas[0].manageHash).toBe(hashDemoShareToken(creado.manageToken));
    const texto = JSON.stringify(filas[0]);
    expect(texto).not.toContain(creado.shareToken);
    expect(texto).not.toContain(creado.manageToken);
    expect(texto).not.toContain(IP);

    const canje = await service.redeem(creado.shareToken, IP);
    expect(canje.readOnly).toBe(true);
    expect(canje.document.name).toBe('Casa de prueba');
    expect(
      (canje.document.cadDocument.entities as Array<{ id: string }>)[0].id,
    ).toBe('muro-sur');

    await service.remove(creado.manageToken);
    await expect(service.redeem(creado.shareToken, IP)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // Borrar dos veces no es un error: el visitante puede pulsar otra vez.
    await expect(service.remove(creado.manageToken)).resolves.toBeUndefined();
  });

  it('la copia no lleva historial ni rásters, y vacía publicaciones y referencias externas', async () => {
    const creado = await service.create(
      gz(
        plano({
          meta: { schema: 4, version: 1, unit: 'mm' },
          entities: [
            ...plano().entities,
            {
              id: 'foto',
              type: 'image',
              definition: 'foto-del-terreno',
              insertion: { x: 0, y: 0, z: 0 },
              uVector: { x: 1, y: 0, z: 0 },
              vVector: { x: 0, y: 1, z: 0 },
              size: { width: 1024, height: 768 },
              layer: '0',
            },
          ],
          modelSpace: { entityIds: ['muro-sur', 'foto'] },
          imageDefinitions: [
            {
              id: 'foto-del-terreno',
              uri: 'https://ejemplo.invalid/privado/foto.png',
              pixelWidth: 1024,
              pixelHeight: 768,
            },
          ],
          history: [{ id: 'h1' }],
        }),
      ),
      undefined,
      IP,
    );
    const { document } = await service.redeem(creado.shareToken, IP);
    const copia = document.cadDocument as Record<string, unknown>;
    expect(document.name).toBe('Plano de la demostración');
    expect((copia.entities as Array<{ id: string }>).map((e) => e.id)).toEqual([
      'muro-sur',
    ]);
    expect((copia.modelSpace as { entityIds: string[] }).entityIds).toEqual([
      'muro-sur',
    ]);
    expect(copia.imageDefinitions).toEqual([]);
    expect(JSON.stringify(copia)).not.toContain('ejemplo.invalid');
    expect(copia.history).toEqual([]);
    expect(copia.publications).toEqual([]);
    expect(copia.externalReferences).toEqual([]);
  });

  it('un enlace caducado responde demo_share_expired aunque el barrido no haya pasado', async () => {
    const creado = await service.create(gz(plano()), 'x', IP);
    await harness.dataSource
      .getRepository(CadDemoShare)
      .createQueryBuilder()
      .update()
      .set({
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      })
      .where('1 = 1')
      .execute();
    await expect(service.redeem(creado.shareToken, IP)).rejects.toMatchObject({
      response: { code: 'demo_share_expired' },
    });
    expect(await service.deleteExpired()).toBe(1);
    await expect(service.redeem(creado.shareToken, IP)).rejects.toMatchObject({
      response: { code: 'demo_share_invalid' },
    });
  });

  it('rechaza un plano vacío, uno demasiado grande y tokens con otra forma', async () => {
    await expect(
      service.create(gz(plano({ entities: [] })), 'x', IP),
    ).rejects.toThrow('vacío');
    await expect(
      service.create(Buffer.alloc(DEMO_SHARE_MAX_GZIP_BYTES + 1), 'x', IP),
    ).rejects.toBeInstanceOf(HttpException);
    await expect(
      service.redeem('vdrl_de-un-review-link-no-de-la-demo', IP),
    ).rejects.toMatchObject({
      response: { code: 'demo_share_invalid' },
    });
    await expect(service.redeem(undefined, IP)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('aplica los tres techos de creación y el de lectura con la IP, nunca guardada', async () => {
    const creado = await service.create(gz(plano()), 'x', IP);
    const scopes = enforce.mock.calls.map((call) => (call as unknown[])[0]);
    expect(scopes).toEqual([
      'cad.demo-share.create.10m',
      'cad.demo-share.create.day',
      'cad.demo-share.create.global',
    ]);
    await service.redeem(creado.shareToken, IP);
    expect((enforce.mock.calls.at(-1) as unknown[] | undefined)?.[0]).toBe(
      'cad.demo-share.read',
    );
  });

  it('el operador lo pausa con CAD_DEMO_SHARES_ENABLED=false', async () => {
    process.env.CAD_DEMO_SHARES_ENABLED = 'false';
    await expect(service.create(gz(plano()), 'x', IP)).rejects.toMatchObject({
      response: { code: 'demo_share_paused' },
    });
  });

  it('reclamar encuentra el enlace vigente sin borrarlo hasta completarlo', async () => {
    const creado = await service.create(gz(plano()), 'x', IP);
    const encontrado = await service.findForClaim(creado.manageToken);
    expect(encontrado.tokenHash).toBe(hashDemoShareToken(creado.shareToken));
    // Hasta que la sesión de revisión exista, el enlace sigue sirviendo.
    await expect(service.redeem(creado.shareToken, IP)).resolves.toBeDefined();
    await service.completeClaim(encontrado.id);
    await expect(service.redeem(creado.shareToken, IP)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      service.findForClaim(creado.manageToken),
    ).rejects.toMatchObject({
      response: { code: 'demo_share_expired' },
    });
  });
});
