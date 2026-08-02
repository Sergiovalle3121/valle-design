import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { TenantModule } from '../../common/tenant/tenant.module';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import {
  describePostgres,
  postgresTestUrl,
} from '../../common/testing/postgres-harness';
import { AuthModule } from '../auth/auth.module';
import { CadAuthGuard } from '../auth/guards/cad-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { DesignAuditLog } from '../audit-log/design-audit-log.service';
import { BlobStoreModule } from '../blob-store/blob-store.module';
import { CadDocumentsModule } from '../cad-documents/cad-documents.module';
import { CadModule } from './cad.module';

/**
 * AISLAMIENTO ENTRE DOS TENANTS POR API REAL sobre PostgreSQL (Fase 5) — la
 * prueba corre el stack COMPLETO (guards + interceptor + scoping TypeORM)
 * contra una base real, con la imposición comercial en modo `platform-api`
 * servida por un servidor HTTP REAL del contrato platform-api.v1.yaml
 * (levantado aquí; el switch a la Platform productiva es apuntar la URL).
 *
 * Matriz del mandato:
 * 1. Tenant B no puede leer/escribir/canjear NADA de tenant A — documentos,
 *    proyectos, versiones, publicaciones, DXF, bloques, review sessions,
 *    comments (404 scoped; las listas de B no contienen ids de A).
 * 2. El token de review de A abre SOLO el documento de A (el tenant sale de
 *    la fila de la sesión) y su contexto no alcanza nada de B.
 * 3. Un JWT VÁLIDO sin entitlement (Platform niega) recibe
 *    `403 entitlement_required` en TODOS los endpoints CAD — la superficie
 *    se barre PROGRAMÁTICAMENTE desde el router real, no a mano.
 */
describePostgres(
  'Aislamiento multi-tenant /v1/cad (PostgreSQL + platform-api real)',
  () => {
    jest.setTimeout(120_000);

    let app: NestExpressApplication;
    let jwt: JwtService;
    let platform: Server;
    let schema: string;

    /** Tenants con grant design.cad activo en el Platform de prueba. */
    const ENTITLED = new Set(['tenant-a', 'tenant-b']);
    const platformRequests: Array<{ tenant: string | null; url: string }> = [];

    const ENV_KEYS = [
      'ENTITLEMENTS_MODE',
      'PLATFORM_API_URL',
      'ENTITLEMENTS_CACHE_TTL_MS',
      'ENTITLEMENTS_TIMEOUT_MS',
    ] as const;
    const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

    const token = (tenant: string, email = `user@${tenant}`) =>
      jwt.sign({
        sub: `user-${tenant}`,
        email,
        role: '',
        tenant_id: tenant,
        organization_id: null,
        plant_id: null,
        permissions: [
          'cad:view',
          'cad:edit',
          'cad:review',
          'cad:publish',
          'cad:admin',
        ],
        scopes: null,
      });

    /** El Platform de prueba lee el tenant del claim del bearer (JWT real). */
    const tenantFromBearer = (authorization?: string): string | null => {
      const raw = (authorization ?? '').replace(/^Bearer\s+/i, '');
      try {
        const payload = JSON.parse(
          Buffer.from(raw.split('.')[1] ?? '', 'base64url').toString('utf8'),
        ) as { tenant_id?: string };
        return payload.tenant_id ?? null;
      } catch {
        return null;
      }
    };

    beforeAll(async () => {
      for (const key of ENV_KEYS) {
        if (process.env[key] !== undefined) savedEnv[key] = process.env[key];
      }

      // ── Servidor HTTP REAL del contrato platform-api.v1.yaml ──
      platform = createServer((req, res) => {
        const tenant = tenantFromBearer(req.headers.authorization);
        platformRequests.push({ tenant, url: req.url ?? '' });
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
        const active =
          code === 'design.cad' && !!tenant && ENTITLED.has(tenant);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            code,
            active,
            ...(active ? {} : { reason: 'not_entitled' }),
          }),
        );
      });
      await new Promise<void>((resolve) =>
        platform.listen(0, '127.0.0.1', resolve),
      );
      process.env.ENTITLEMENTS_MODE = 'platform-api';
      process.env.PLATFORM_API_URL = `http://127.0.0.1:${(platform.address() as AddressInfo).port}`;
      process.env.ENTITLEMENTS_CACHE_TTL_MS = '60000';
      process.env.ENTITLEMENTS_TIMEOUT_MS = '2000';

      // ── Esquema propio y desechable en la base real ──
      const url = postgresTestUrl()!;
      schema = `viso_${randomBytes(6).toString('hex')}`;
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
          }),
          TenantModule,
          AuthModule,
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
      await app.init();
      jwt = app.get(JwtService);
    });

    afterAll(async () => {
      if (app) await app.close();
      if (platform) {
        await new Promise<void>((resolve, reject) =>
          platform.close((err) => (err ? reject(err) : resolve())),
        );
      }
      const url = postgresTestUrl();
      if (url && schema) {
        const cleanup = new DataSource({ type: 'postgres', url });
        await cleanup.initialize();
        await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await cleanup.destroy();
      }
      for (const key of ENV_KEYS) {
        if (savedEnv[key] === undefined) delete process.env[key];
        else process.env[key] = savedEnv[key];
      }
    });

    /** Semilla de un tenant: proyecto, documento con contenido, publicación, bloque, sesión con link y comentario. */
    interface TenantFixture {
      auth: string;
      projectId: string;
      documentId: string;
      blockId: string;
      sessionId: string;
      commentId: string;
      shareToken: string;
    }

    const seedTenant = async (tenant: string): Promise<TenantFixture> => {
      const auth = `Bearer ${token(tenant)}`;
      const server = app.getHttpServer();
      const project = await request(server)
        .post('/v1/cad/projects')
        .set('Authorization', auth)
        .send({ name: `Planta ${tenant}` })
        .expect(201);
      const document = await request(server)
        .post('/v1/cad/documents')
        .set('Authorization', auth)
        .send({ name: `Plano ${tenant}`, projectId: project.body.id })
        .expect(201);
      await request(server)
        .put(`/v1/cad/documents/${document.body.id}/content`)
        .set('Authorization', auth)
        .send({
          cadDocument: {
            meta: { schema: 3, version: 1, unit: 'mm' },
            entities: [
              {
                id: `e-${tenant}`,
                type: 'line',
                start: { x: 0, y: 0 },
                end: { x: 100, y: 0 },
              },
            ],
            paperSpaces: [{ id: 'sheet-1', page: { width: 297, height: 210 } }],
          },
          expectedCadDocumentVersion: 0,
        })
        .expect(200);
      await request(server)
        .post(`/v1/cad/documents/${document.body.id}/publications`)
        .set('Authorization', auth)
        .send({
          expectedCadDocumentVersion: 1,
          paperSpaceIds: ['sheet-1'],
          fileName: `${tenant}.pdf`,
          sha256: 'a'.repeat(64),
          bytes: 128,
        })
        .expect(201);
      const block = await request(server)
        .post('/v1/cad/blocks')
        .set('Authorization', auth)
        .send({
          name: `Bloque ${tenant}`,
          assets: [{ id: 'a1', kind: 'box', x: 0, y: 0, w: 10, h: 10 }],
        })
        .expect(201);
      const session = await request(server)
        .post(`/v1/cad/documents/${document.body.id}/review-sessions`)
        .set('Authorization', auth)
        .send({ shareLink: true })
        .expect(201);
      const comment = await request(server)
        .post(`/v1/cad/documents/${document.body.id}/comments`)
        .set('Authorization', auth)
        .send({
          body: `Comentario ${tenant}`,
          reviewSessionId: session.body.session.id,
        })
        .expect(201);
      return {
        auth,
        projectId: project.body.id,
        documentId: document.body.id,
        blockId: block.body.id,
        sessionId: session.body.session.id,
        commentId: comment.body.id,
        shareToken: session.body.shareToken,
      };
    };

    let A: TenantFixture;
    let B: TenantFixture;

    it('siembra dos tenants por la API real (Platform concede a ambos)', async () => {
      A = await seedTenant('tenant-a');
      B = await seedTenant('tenant-b');
      expect(A.documentId).not.toBe(B.documentId);
      // El bearer del request se reenvió TAL CUAL al Platform de prueba.
      expect(platformRequests.length).toBeGreaterThan(0);
      expect(
        platformRequests.every((r) => r.url === '/v1/entitlements/design.cad'),
      ).toBe(true);
      expect(new Set(platformRequests.map((r) => r.tenant))).toEqual(
        new Set(['tenant-a', 'tenant-b']),
      );
    });

    it('B no puede leer/escribir NADA de A: documentos, proyectos, versiones, publicaciones, DXF, bloques, reviews, comments', async () => {
      const server = app.getHttpServer();
      const attempts: Array<[string, string, unknown?]> = [
        // Proyectos.
        ['get', `/v1/cad/projects/${A.projectId}`],
        ['patch', `/v1/cad/projects/${A.projectId}`, { name: 'pirata' }],
        ['delete', `/v1/cad/projects/${A.projectId}`],
        // Documentos.
        ['get', `/v1/cad/documents/${A.documentId}`],
        ['patch', `/v1/cad/documents/${A.documentId}`, { name: 'pirata' }],
        ['delete', `/v1/cad/documents/${A.documentId}`],
        [
          'put',
          `/v1/cad/documents/${A.documentId}/content`,
          {
            cadDocument: { meta: { schema: 3 }, entities: [] },
            expectedCadDocumentVersion: 2,
          },
        ],
        // Versiones.
        ['get', `/v1/cad/documents/${A.documentId}/versions`],
        ['get', `/v1/cad/documents/${A.documentId}/versions/1`],
        // Publicaciones.
        ['get', `/v1/cad/documents/${A.documentId}/publications`],
        [
          'post',
          `/v1/cad/documents/${A.documentId}/publications`,
          {
            expectedCadDocumentVersion: 2,
            paperSpaceIds: ['sheet-1'],
            fileName: 'pirata.pdf',
            sha256: 'b'.repeat(64),
            bytes: 1,
          },
        ],
        // DXF.
        ['get', `/v1/cad/documents/${A.documentId}/dxf`],
        [
          'put',
          `/v1/cad/documents/${A.documentId}/dxf`,
          { name: 'p.dxf', data: '0' },
        ],
        ['delete', `/v1/cad/documents/${A.documentId}/dxf`],
        ['get', `/v1/cad/documents/${A.documentId}/export/dxf`],
        // Bloques.
        ['get', `/v1/cad/blocks/${A.blockId}`],
        ['patch', `/v1/cad/blocks/${A.blockId}`, { name: 'pirata' }],
        ['delete', `/v1/cad/blocks/${A.blockId}`],
        // Review sessions.
        ['get', `/v1/cad/documents/${A.documentId}/review-sessions`],
        [
          'post',
          `/v1/cad/documents/${A.documentId}/review-sessions`,
          { shareLink: true },
        ],
        ['post', `/v1/cad/review-sessions/${A.sessionId}/close`],
        // Comments.
        ['get', `/v1/cad/documents/${A.documentId}/comments`],
        [
          'post',
          `/v1/cad/documents/${A.documentId}/comments`,
          { body: 'pirata' },
        ],
        ['post', `/v1/cad/comments/${A.commentId}/resolve`],
        // Intent (IA) sobre documento ajeno.
        [
          'post',
          `/v1/cad/documents/${A.documentId}/intent`,
          { prompt: 'hola' },
        ],
      ];
      for (const [method, path, body] of attempts) {
        const req = (
          request(server) as unknown as Record<
            string,
            (url: string) => request.Test
          >
        )
          [method](path)
          .set('Authorization', B.auth);
        const res =
          body !== undefined ? await req.send(body as object) : await req;
        expect(`${method} ${path} → ${res.status}`).toBe(
          `${method} ${path} → 404`,
        );
      }

      // Las LISTAS de B no contienen nada de A.
      const projects = await request(server)
        .get('/v1/cad/projects')
        .set('Authorization', B.auth)
        .expect(200);
      expect(
        projects.body.items.map((p: { id: string }) => p.id),
      ).not.toContain(A.projectId);
      const documents = await request(server)
        .get('/v1/cad/documents')
        .set('Authorization', B.auth)
        .expect(200);
      expect(
        documents.body.items.map((d: { id: string }) => d.id),
      ).not.toContain(A.documentId);
      const blocks = await request(server)
        .get('/v1/cad/blocks')
        .set('Authorization', B.auth)
        .expect(200);
      expect(blocks.body.items.map((b: { id: string }) => b.id)).not.toContain(
        A.blockId,
      );

      // Nada de A cambió tras los intentos de B.
      const intact = await request(server)
        .get(`/v1/cad/documents/${A.documentId}`)
        .set('Authorization', A.auth)
        .expect(200);
      expect(intact.body.name).toBe('Plano tenant-a');
      expect(intact.body.cadDocumentVersion).toBe(2); // save + publicación de A.
    });

    it('el token de review de A solo abre el documento de A y no alcanza nada de B', async () => {
      const server = app.getHttpServer();
      // Canje en contexto limpio: el tenant/documento salen de la FILA.
      const context = await request(server)
        .get('/v1/cad/review/context')
        .set('X-Review-Token', A.shareToken)
        .expect(200);
      expect(context.body.document.id).toBe(A.documentId);
      expect(context.body.session.documentId).toBe(A.documentId);

      // El contexto de review de A NO llega al documento de B (ni a ninguno):
      // fuera de su superficie todo es 403 review_read_only.
      const cross = await request(server)
        .get(`/v1/cad/documents/${B.documentId}`)
        .set('X-Review-Token', A.shareToken)
        .expect(403);
      expect(cross.body.code).toBe('review_read_only');

      // Un comentario de B no es resoluble desde el hilo del link de A (404 —
      // scoping por tenant + por sesión).
      await request(server)
        .post(`/v1/cad/review/comments/${B.commentId}/resolve`)
        .set('X-Review-Token', A.shareToken)
        .expect(404);

      // El hilo del invitado de A solo contiene comentarios de SU sesión.
      const thread = await request(server)
        .get('/v1/cad/review/comments')
        .set('X-Review-Token', A.shareToken)
        .expect(200);
      for (const item of thread.body.items) {
        expect(item.documentId).toBe(A.documentId);
        expect(item.reviewSessionId).toBe(A.sessionId);
      }

      // Un token inventado no abre nada de nadie.
      await request(server)
        .get('/v1/cad/review/context')
        .set('X-Review-Token', `vdrl_${'z'.repeat(43)}`)
        .expect(401);
    });

    it('un JWT válido SIN entitlement recibe 403 entitlement_required en TODA la superficie CAD (barrido programático del router)', async () => {
      const server = app.getHttpServer();
      const noEntitlement = `Bearer ${token('tenant-none')}`;

      // Enumeración PROGRAMÁTICA de la superficie desde el router real de
      // Express (5.x usa `router`; 4.x usaba `_router`) — no una lista a mano.
      const express = app.getHttpAdapter().getInstance() as unknown as {
        router?: { stack: unknown[] };
        _router?: { stack: unknown[] };
      };
      const stack = (express.router ?? express._router)?.stack ?? [];
      const routes: Array<{ method: string; path: string }> = [];
      for (const layer of stack as Array<{
        route?: { path: string | string[]; methods: Record<string, boolean> };
      }>) {
        if (!layer.route) continue;
        const paths = Array.isArray(layer.route.path)
          ? layer.route.path
          : [layer.route.path];
        for (const path of paths) {
          for (const method of Object.keys(layer.route.methods)) {
            if (layer.route.methods[method]) routes.push({ method, path });
          }
        }
      }
      const cadRoutes = routes.filter((r) => r.path.startsWith('/v1/cad'));
      // Sanidad del barrido: si la enumeración se rompe, el test NO puede
      // volverse verde por barrer cero rutas.
      expect(cadRoutes.length).toBeGreaterThanOrEqual(30);

      const placeholder = (path: string) =>
        path
          .replace(/:version\b/g, '1')
          .replace(/:[A-Za-z]+/g, () => randomUUID());

      for (const { method, path } of cadRoutes) {
        const url = placeholder(path);
        const req = (
          request(server) as unknown as Record<
            string,
            (url: string) => request.Test
          >
        )
          [method](url)
          .set('Authorization', noEntitlement);
        const res = await req;
        if (path.startsWith('/v1/cad/review/')) {
          // Superficie del review link: exige token de link — un JWT jamás la
          // abre (401), con o sin entitlement.
          expect(`${method} ${path} → ${res.status}`).toBe(
            `${method} ${path} → 401`,
          );
          continue;
        }
        expect(`${method} ${path} → ${res.status}`).toBe(
          `${method} ${path} → 403`,
        );
        expect(res.body).toMatchObject({
          code: 'entitlement_required',
          details: { reason: 'not_entitled' },
        });
      }

      // La denegación quedó auditada con el tenant del actor estampado.
      const audit = app.get(DesignAuditLog);
      const tenantCtx = app.get(TenantContextService);
      const entries = await tenantCtx.run(
        {
          tenant_id: 'tenant-none',
          organization_id: null,
          plant_id: null,
          user_email: 'spec@test',
          role: null,
          permissions: null,
          scopes: null,
        },
        () => audit.recent(200),
      );
      const denials = entries.filter((e) => e.action === 'ENTITLEMENT_DENIED');
      expect(denials.length).toBeGreaterThan(0);
      expect(denials.every((e) => e.tenantId === 'tenant-none')).toBe(true);
    });
  },
);
