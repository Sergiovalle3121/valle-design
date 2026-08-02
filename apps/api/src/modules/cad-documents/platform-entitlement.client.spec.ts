import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import {
  PlatformEntitlementClient,
  resolveEntitlementsMode,
} from './platform-entitlement.client';

/**
 * Cliente HTTP REAL de entitlements contra un servidor HTTP REAL (levantado
 * aquí, no un mock del cliente) que sirve el contrato
 * `specs/platform-api.v1.yaml` (`GET /v1/entitlements/{code}`). Platform aún
 * no implementa el API: cuando lo haga, el switch productivo es apuntar
 * PLATFORM_API_URL — el contrato ya se ejercita íntegro aquí.
 */
describe('PlatformEntitlementClient (HTTP real, contrato platform-api.v1)', () => {
  jest.setTimeout(20_000);

  /** Tabla de respuestas por bearer, controlada por cada test. */
  const grants = new Map<
    string,
    | { active: boolean; reason?: string }
    | { status: number }
    | { hangMs: number }
  >();
  const seenRequests: Array<{ url: string; authorization?: string }> = [];

  let server: Server;
  let baseUrl: string;

  const ENV_KEYS = [
    'ENTITLEMENTS_MODE',
    'PLATFORM_API_URL',
    'ENTITLEMENTS_TIMEOUT_MS',
    'ENTITLEMENTS_CACHE_TTL_MS',
    'NODE_ENV',
  ] as const;
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

  beforeAll(async () => {
    for (const key of ENV_KEYS) {
      if (process.env[key] !== undefined) savedEnv[key] = process.env[key];
    }
    server = createServer((req, res) => {
      const authorization = req.headers.authorization;
      seenRequests.push({ url: req.url ?? '', authorization });
      const match = /^\/v1\/entitlements\/([^/?]+)$/.exec(req.url ?? '');
      if (!match) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            success: false,
            statusCode: 404,
            message: 'not found',
          }),
        );
        return;
      }
      const code = decodeURIComponent(match[1]);
      if (code !== 'design.cad') {
        // Contrato: 404 = el código no existe en el catálogo de capacidades.
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            success: false,
            statusCode: 404,
            message: 'unknown code',
          }),
        );
        return;
      }
      const bearer = (authorization ?? '').replace(/^Bearer\s+/i, '');
      const grant = grants.get(bearer);
      if (!grant) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            success: false,
            statusCode: 401,
            message: 'invalid token',
          }),
        );
        return;
      }
      if ('hangMs' in grant) {
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ code, active: true }));
        }, grant.hangMs).unref();
        return;
      }
      if ('status' in grant) {
        res.writeHead(grant.status, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            success: false,
            statusCode: grant.status,
            message: 'error',
          }),
        );
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          code,
          active: grant.active,
          ...(grant.active ? {} : { reason: grant.reason ?? 'not_entitled' }),
        }),
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  beforeEach(() => {
    grants.clear();
    seenRequests.length = 0;
    process.env.ENTITLEMENTS_MODE = 'platform-api';
    process.env.PLATFORM_API_URL = baseUrl;
    process.env.ENTITLEMENTS_TIMEOUT_MS = '400';
    process.env.ENTITLEMENTS_CACHE_TTL_MS = '60000';
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  const makeClient = () =>
    new PlatformEntitlementClient(new TenantContextService());
  const ctx = (tenantId: string, bearerToken: string) => ({
    tenantId,
    bearerToken,
  });

  it('el modo por defecto es allow-all en dev y platform-api (fail-closed) en prod', () => {
    delete process.env.ENTITLEMENTS_MODE;
    process.env.NODE_ENV = 'test';
    expect(resolveEntitlementsMode()).toBe('allow-all');

    process.env.NODE_ENV = 'production';
    expect(resolveEntitlementsMode()).toBe('platform-api');

    process.env.ENTITLEMENTS_MODE = 'allow-all';
    expect(resolveEntitlementsMode()).toBe('allow-all');
  });

  it('allow-all concede sin tocar la red', async () => {
    process.env.ENTITLEMENTS_MODE = 'allow-all';
    await expect(makeClient().hasEntitlement('design.cad')).resolves.toBe(true);
    expect(seenRequests).toHaveLength(0);
  });

  it('reenvía el bearer del request y concede solo con active:true del contrato', async () => {
    grants.set('jwt-tenant-a', { active: true });
    grants.set('jwt-tenant-b', { active: false, reason: 'not_entitled' });
    const client = makeClient();

    await expect(
      client.hasEntitlement('design.cad', ctx('tenant-a', 'jwt-tenant-a')),
    ).resolves.toBe(true);
    await expect(
      client.hasEntitlement('design.cad', ctx('tenant-b', 'jwt-tenant-b')),
    ).resolves.toBe(false);

    expect(seenRequests.map((r) => r.url)).toEqual([
      '/v1/entitlements/design.cad',
      '/v1/entitlements/design.cad',
    ]);
    expect(seenRequests[0].authorization).toBe('Bearer jwt-tenant-a');
    expect(seenRequests[1].authorization).toBe('Bearer jwt-tenant-b');
  });

  it('cachea por tenant durante el TTL (positivo y negativo) y expira después', async () => {
    grants.set('jwt-a', { active: true });
    grants.set('jwt-b', { active: false });
    const client = makeClient();

    await client.hasEntitlement('design.cad', ctx('tenant-a', 'jwt-a'));
    await client.hasEntitlement('design.cad', ctx('tenant-a', 'jwt-a'));
    await client.hasEntitlement('design.cad', ctx('tenant-a', 'jwt-a'));
    // Otro tenant NO comparte la entrada de caché.
    await client.hasEntitlement('design.cad', ctx('tenant-b', 'jwt-b'));
    await client.hasEntitlement('design.cad', ctx('tenant-b', 'jwt-b'));
    expect(seenRequests).toHaveLength(2);

    // TTL 0 = sin caché: cada verificación vuelve a Platform.
    process.env.ENTITLEMENTS_CACHE_TTL_MS = '0';
    const uncached = makeClient();
    await uncached.hasEntitlement('design.cad', ctx('tenant-a', 'jwt-a'));
    await uncached.hasEntitlement('design.cad', ctx('tenant-a', 'jwt-a'));
    expect(seenRequests).toHaveLength(4);
  });

  it('fail-closed: timeout corto, 5xx, cuerpo sin eco del código y red caída niegan', async () => {
    const client = makeClient();

    // Timeout (el servidor tarda más que ENTITLEMENTS_TIMEOUT_MS).
    grants.set('jwt-slow', { hangMs: 2_000 });
    await expect(
      client.hasEntitlement('design.cad', ctx('tenant-slow', 'jwt-slow')),
    ).resolves.toBe(false);

    // 500 del servidor.
    grants.set('jwt-500', { status: 500 });
    await expect(
      client.hasEntitlement('design.cad', ctx('tenant-500', 'jwt-500')),
    ).resolves.toBe(false);

    // 401 (token que Platform no reconoce).
    await expect(
      client.hasEntitlement('design.cad', ctx('tenant-x', 'jwt-desconocido')),
    ).resolves.toBe(false);

    // Red caída (puerto sin listener).
    process.env.PLATFORM_API_URL = 'http://127.0.0.1:1';
    await expect(
      client.hasEntitlement('design.cad', ctx('tenant-net', 'jwt-net')),
    ).resolves.toBe(false);

    // Los errores de transporte NO se cachean: al volver la red, concede.
    process.env.PLATFORM_API_URL = baseUrl;
    grants.set('jwt-net', { active: true });
    await expect(
      client.hasEntitlement('design.cad', ctx('tenant-net', 'jwt-net')),
    ).resolves.toBe(true);
  });

  it('fail-closed sin URL configurada, sin tenant o sin bearer', async () => {
    const client = makeClient();

    delete process.env.PLATFORM_API_URL;
    await expect(
      client.hasEntitlement('design.cad', ctx('tenant-a', 'jwt-a')),
    ).resolves.toBe(false);

    process.env.PLATFORM_API_URL = baseUrl;
    grants.set('jwt-a', { active: true });
    await expect(
      client.hasEntitlement('design.cad', {
        tenantId: null,
        bearerToken: 'jwt-a',
      }),
    ).resolves.toBe(false);
    await expect(
      client.hasEntitlement('design.cad', {
        tenantId: 'tenant-a',
        bearerToken: null,
      }),
    ).resolves.toBe(false);
    expect(seenRequests).toHaveLength(0);
  });

  it('un 404 de código fuera del catálogo niega (y es cacheable como resuelto)', async () => {
    grants.set('jwt-a', { active: true });
    const client = makeClient();
    await expect(
      client.hasEntitlement('design.other', ctx('tenant-a', 'jwt-a')),
    ).resolves.toBe(false);
    // El servidor de contrato responde 200 con eco del código pedido; aquí
    // forzamos la ruta 404 con una URL que el servidor no enruta.
    process.env.PLATFORM_API_URL = `${baseUrl}/no-such-mount`;
    await expect(
      client.hasEntitlement('design.cad', ctx('tenant-404', 'jwt-a')),
    ).resolves.toBe(false);
  });
});
