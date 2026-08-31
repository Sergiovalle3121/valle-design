import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as http from 'node:http';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { TenantModule } from '../../common/tenant/tenant.module';
import {
  describePostgres,
  postgresTestUrl,
} from '../../common/testing/postgres-harness';
import {
  FIRST_PARTY_AUTH_ENTITY_GRAPH,
  type FirstPartyCadActor,
  seedFirstPartyCadActor,
} from '../../common/testing/first-party-cad-auth';
import { CadAuthGuard } from '../auth/guards/cad-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { BlobStoreModule } from '../blob-store/blob-store.module';
import { CadDocumentsModule } from '../cad-documents/cad-documents.module';
import { IdentityModule } from '../identity/identity.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { CadModule } from './cad.module';
import { CadPresenceBeat } from './entities/cad-presence-beat.entity';

/**
 * El peor fallo posible de este frente: un cursor que cruza de tenant.
 *
 * Sigue el patrón de `cad-tenant-isolation.pg.spec.ts` (stack COMPLETO —
 * guards + interceptor + scoping — sobre PostgreSQL real), acotado a la
 * superficie de presencia. Cubre las tres formas en que un cursor podría
 * cruzar:
 *
 *   1. Publicar sobre el documento de OTRO tenant → 404 (nunca se guarda).
 *   2. Abrir el stream del documento de OTRO tenant → 404 ANTES de que se
 *      comprometan las cabeceras SSE (ver `sse-stream.js`: el error se
 *      resuelve como respuesta HTTP normal si ocurre antes del primer dato).
 *   3. El snapshot que SÍ ve el stream propio nunca contiene un peer de otro
 *      tenant, verificado tanto por la fila cruda en PostgreSQL como por el
 *      primer evento real que entrega el stream HTTP.
 */
describePostgres(
  'Aislamiento multi-tenant de presencia CAD (PostgreSQL + auth first-party)',
  () => {
    jest.setTimeout(120_000);

    let app: NestExpressApplication;
    let server: http.Server;
    let baseUrl: string;
    let dataSource: DataSource;
    let schema: string;

    beforeAll(async () => {
      const url = postgresTestUrl()!;
      schema = `vpres_${randomBytes(6).toString('hex')}`;
      const bootstrap = new DataSource({ type: 'postgres', url });
      await bootstrap.initialize();
      await bootstrap.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      await bootstrap.destroy();

      const moduleRef = await Test.createTestingModule({
        imports: [
          TypeOrmModule.forRoot({
            type: 'postgres',
            url,
            schema,
            synchronize: true,
            autoLoadEntities: true,
            entities: [...FIRST_PARTY_AUTH_ENTITY_GRAPH],
          }),
          TenantModule,
          IdentityModule,
          OrganizationsModule,
          AuditLogModule,
          BlobStoreModule,
          CadDocumentsModule,
          CadModule,
        ],
        providers: [
          { provide: APP_GUARD, useClass: CadAuthGuard },
          { provide: APP_GUARD, useClass: PermissionsGuard },
          { provide: APP_FILTER, useClass: AllExceptionsFilter },
        ],
      }).compile();

      app = moduleRef.createNestApplication<NestExpressApplication>();
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          transform: true,
          forbidNonWhitelisted: true,
          transformOptions: { enableImplicitConversion: true },
        }),
      );
      // `listen(0)` (no sólo `init()`): la lectura cruda del stream SSE (más
      // abajo) necesita un socket TCP de verdad escuchando, no el adaptador en
      // memoria que `supertest` abre implícitamente por petición.
      await app.listen(0);
      server = app.getHttpServer();
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('No se pudo abrir el servidor HTTP de prueba.');
      }
      baseUrl = `http://127.0.0.1:${address.port}`;
      dataSource = app.get(DataSource);
    });

    afterAll(async () => {
      // `server.close()` (dentro de `app.close()`) espera a que TODAS las
      // conexiones, incluidas las keep-alive inactivas de `supertest`, se
      // cierren solas — lo que puede tardar hasta el `keepAliveTimeout` del
      // servidor. `closeAllConnections()` las corta de inmediato: no hay
      // ninguna petición en vuelo que perder al cerrar el proceso de prueba.
      server?.closeAllConnections?.();
      if (app) await app.close();
      const url = postgresTestUrl();
      if (url && schema) {
        const cleanup = new DataSource({ type: 'postgres', url });
        await cleanup.initialize();
        await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await cleanup.destroy();
      }
    });

    interface TenantFixture {
      auth: FirstPartyCadActor;
      documentId: string;
    }

    const seedTenant = async (label: string): Promise<TenantFixture> => {
      const auth = await seedFirstPartyCadActor(dataSource, {
        email: `presence-${label}@test.invalid`,
        organizationName: `Presencia ${label}`,
        role: 'owner',
      });
      const document = await request(server)
        .post('/v1/cad/documents')
        .set(auth.headers)
        .send({ name: `Plano ${label}` })
        .expect(201);
      const body = document.body as { id: string };
      return { auth, documentId: body.id };
    };

    let A: TenantFixture;
    let B: TenantFixture;

    it('siembra dos organizaciones first-party con documento propio', async () => {
      A = await seedTenant('a');
      B = await seedTenant('b');
      expect(A.documentId).not.toBe(B.documentId);
    });

    it('A publica su latido; el snapshot crudo en PostgreSQL lo confirma con SU tenant', async () => {
      await request(server)
        .post(`/v1/cad/documents/${A.documentId}/presence`)
        .set(A.auth.headers)
        .send({ peerId: 'peer-a-1', cursor: { x: 10, y: 20 }, viewport: null })
        .expect(204);

      const rows = await dataSource
        .getRepository(CadPresenceBeat)
        .find({ where: { documentId: A.documentId } });
      expect(rows).toHaveLength(1);
      expect(rows[0].tenant_id).toBe(A.auth.organizationId);
      expect(rows[0].peerId).toBe('peer-a-1');
      // El nombre lo derivó el SERVIDOR del email de la sesión, no del cuerpo.
      expect(rows[0].name).toBe('presence-a');
    });

    it('B no puede publicar sobre el documento de A (404, nunca se guarda)', async () => {
      const before = await dataSource
        .getRepository(CadPresenceBeat)
        .count({ where: { documentId: A.documentId } });

      await request(server)
        .post(`/v1/cad/documents/${A.documentId}/presence`)
        .set(B.auth.headers)
        .send({ peerId: 'peer-b-intruso', cursor: null, viewport: null })
        .expect(404);

      const after = await dataSource
        .getRepository(CadPresenceBeat)
        .count({ where: { documentId: A.documentId } });
      expect(after).toBe(before);
    });

    it('B no puede abrir el stream del documento de A (404 ANTES de comprometer cabeceras SSE)', async () => {
      const res = await request(server)
        .get(`/v1/cad/documents/${A.documentId}/presence/stream`)
        .set(B.auth.headers)
        .expect(404);
      expect(res.headers['content-type']).not.toMatch(/text\/event-stream/);
    });

    it('el stream de A entrega el snapshot real por HTTP y NUNCA un peer de B', async () => {
      // B publica sobre SU PROPIO documento — no debe aparecer en el stream de A.
      await request(server)
        .post(`/v1/cad/documents/${B.documentId}/presence`)
        .set(B.auth.headers)
        .send({ peerId: 'peer-b-propio', cursor: null, viewport: null })
        .expect(204);

      const chunk = await readFirstSseChunk({
        baseUrl,
        path: `/v1/cad/documents/${A.documentId}/presence/stream`,
        headers: A.auth.headers,
      });
      expect(chunk).toContain('peer-a-1');
      expect(chunk).not.toContain('peer-b-propio');
      expect(chunk).not.toContain('peer-b-intruso');
    });
  },
);

/**
 * Abre una conexión SSE cruda (Node `http`, no `supertest`: la superficie de
 * `supertest` está pensada para respuestas que TERMINAN, y un stream SSE no
 * termina) y resuelve con el primer fragmento de cuerpo recibido — suficiente
 * para el snapshot inicial, que `CadPresenceService.stream` manda ANTES de
 * cualquier evento en vivo. El socket se destruye explícitamente: dejarlo
 * abierto filtraría una conexión SSE viva entre tests.
 */
function readFirstSseChunk(options: {
  baseUrl: string;
  path: string;
  headers: Record<string, string>;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    // Agente propio, sin keep-alive: esta conexión existe para leer UN
    // fragmento y colgar. `destroy()` sobre el socket CRUDO (no sólo sobre
    // `req`/`res`) es lo que de verdad libera el handle de inmediato — con
    // sólo `req.destroy()` el proceso de prueba tardaba muy por encima del
    // segundo que Jest espera antes de avisar "did not exit".
    const agent = new http.Agent({ keepAlive: false });
    let socket: import('node:net').Socket | undefined;
    const req = http.get(
      `${options.baseUrl}${options.path}`,
      { headers: { ...options.headers, Connection: 'close' }, agent },
      (res) => {
        if (res.statusCode !== 200) {
          socket?.destroy();
          reject(new Error(`Stream respondió ${res.statusCode}`));
          return;
        }
        let data = '';
        res.on('data', (piece: Buffer) => {
          data += piece.toString('utf8');
          if (data.includes('\n\n')) {
            socket?.destroy();
            agent.destroy();
            resolve(data);
          }
        });
        res.on('error', reject);
      },
    );
    req.on('socket', (s) => {
      socket = s;
    });
    req.on('error', (err) => {
      // Un `destroy()` sobre un socket ya en uso dispara un ECONNRESET
      // local: no es un fallo del test, es la desconexión que se pidió.
      if (!(err as NodeJS.ErrnoException).message?.includes('ECONNRESET')) {
        reject(err);
      }
    });
    req.setTimeout(15_000, () => {
      socket?.destroy(new Error('Timeout esperando el primer evento SSE'));
    });
  });
}
