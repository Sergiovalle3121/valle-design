import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { TenantModule } from '../../common/tenant/tenant.module';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { AuthModule } from '../auth/auth.module';
import { CadAuthGuard } from '../auth/guards/cad-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { DesignAuditLog } from '../audit-log/design-audit-log.service';
import { BlobStoreModule } from '../blob-store/blob-store.module';
import { CadDocumentsModule } from '../cad-documents/cad-documents.module';
import { CadReviewSession } from '../cad-documents/entities/cad-review-session.entity';
import { CadModule } from './cad.module';

/**
 * REVIEW LINKS PROPIEDAD DEL SERVIDOR (Fase 5) con el stack REAL: guards
 * globales (canje de token incluido), TenantInterceptor, pipes y SQLite en
 * memoria. Cubre la semántica completa de tokens (generación server-owned /
 * hash-only / única aparición en claro / expiración / revocación inmediata),
 * el contexto de solo lectura IMPUESTO POR BACKEND y la auditoría
 * server-owned — incluido el escenario e2e del mandato:
 * crear → canjear en contexto limpio → read-only impuesto → comentar →
 * revocar → el canje muere.
 */
describe('CadReview (/v1/cad review sessions + review links, stack completo)', () => {
  jest.setTimeout(30_000);

  let app: NestExpressApplication;
  let jwt: JwtService;
  let dataSource: DataSource;

  const token = (
    permissions: string[] | null,
    role = '',
    tenant = 'tenant-a',
  ) =>
    jwt.sign({
      sub: 'user-1',
      email: 'autor@test',
      role,
      tenant_id: tenant,
      organization_id: null,
      plant_id: null,
      permissions,
      scopes: null,
    });

  const full = () =>
    token(['cad:view', 'cad:edit', 'cad:review', 'cad:publish', 'cad:admin']);

  const createDocument = async (name = 'Plano review') => {
    const res = await request(app.getHttpServer())
      .post('/v1/cad/documents')
      .set('Authorization', `Bearer ${full()}`)
      .send({ name })
      .expect(201);
    return res.body.id as string;
  };

  const saveContent = async (documentId: string) => {
    await request(app.getHttpServer())
      .put(`/v1/cad/documents/${documentId}/content`)
      .set('Authorization', `Bearer ${full()}`)
      .send({
        cadDocument: {
          meta: { schema: 3, version: 1, unit: 'mm' },
          entities: [
            {
              id: 'line-1',
              type: 'line',
              start: { x: 0, y: 0 },
              end: { x: 500, y: 0 },
            },
          ],
        },
        expectedCadDocumentVersion: 0,
      })
      .expect(200);
  };

  const auditEntries = async (tenant = 'tenant-a') => {
    const audit = app.get(DesignAuditLog);
    const tenantCtx = app.get(TenantContextService);
    return tenantCtx.run(
      {
        tenant_id: tenant,
        organization_id: null,
        plant_id: null,
        user_email: 'spec@test',
        role: null,
        permissions: null,
        scopes: null,
      },
      () => audit.recent(200),
    );
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          dropSchema: true,
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
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  /* ───────────────────────── Superficie del autor ───────────────────────── */

  it('crea sesiones: sin link no hay token; con link el token aparece UNA sola vez y solo se persiste su hash', async () => {
    const documentId = await createDocument();
    const auth = `Bearer ${full()}`;
    const server = app.getHttpServer();

    const plain = await request(server)
      .post(`/v1/cad/documents/${documentId}/review-sessions`)
      .set('Authorization', auth)
      .send({})
      .expect(201);
    expect(plain.body.session).toMatchObject({
      documentId,
      status: 'open',
      hasShareLink: false,
      allowComments: true,
      expiresAt: null,
    });
    expect(plain.body.shareToken).toBeUndefined();

    const withLink = await request(server)
      .post(`/v1/cad/documents/${documentId}/review-sessions`)
      .set('Authorization', auth)
      .send({ shareLink: true, shareLinkTtlMinutes: 60 })
      .expect(201);
    const shareToken = withLink.body.shareToken as string;
    expect(shareToken).toMatch(/^vdrl_[A-Za-z0-9_-]{43}$/);
    expect(withLink.body.session.hasShareLink).toBe(true);
    // Expiración fijada por el SERVIDOR (~60 min desde ahora).
    const expiresAt = new Date(withLink.body.session.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThan(Date.now() + 55 * 60_000);
    expect(expiresAt).toBeLessThan(Date.now() + 65 * 60_000);
    // La respuesta jamás incluye el hash.
    expect(JSON.stringify(withLink.body)).not.toContain('tokenHash');

    // Lo PERSISTIDO es el hash sha256 — nunca el token en claro.
    const row = await dataSource
      .getRepository(CadReviewSession)
      .findOneByOrFail({ id: withLink.body.session.id });
    expect(row.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.tokenHash).not.toContain(shareToken);

    // Listar expone hasShareLink y NUNCA token ni hash.
    const listed = await request(server)
      .get(`/v1/cad/documents/${documentId}/review-sessions`)
      .set('Authorization', auth)
      .expect(200);
    expect(listed.body.items).toHaveLength(2);
    const serialized = JSON.stringify(listed.body);
    expect(serialized).not.toContain(shareToken);
    expect(serialized).not.toContain('tokenHash');
    expect(serialized).not.toContain(row.tokenHash!);

    // La bitácora asentó la creación SIN el token.
    const entries = await auditEntries();
    const created = entries.filter(
      (e) => e.action === 'cad_review_session_created',
    );
    expect(created.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(entries)).not.toContain(shareToken);
  });

  it('comentarios del autor: directos y por sesión, filtros, resolve idempotente y sesión cerrada = 400', async () => {
    const documentId = await createDocument();
    const auth = `Bearer ${full()}`;
    const server = app.getHttpServer();

    const session = await request(server)
      .post(`/v1/cad/documents/${documentId}/review-sessions`)
      .set('Authorization', auth)
      .send({})
      .expect(201);
    const sessionId = session.body.session.id as string;

    // Directo (sin sesión) + anclado a la sesión.
    const direct = await request(server)
      .post(`/v1/cad/documents/${documentId}/comments`)
      .set('Authorization', auth)
      .send({ body: 'Comentario directo' })
      .expect(201);
    expect(direct.body).toMatchObject({
      documentId,
      reviewSessionId: null,
      author: 'autor@test',
      resolved: false,
    });

    const anchored = await request(server)
      .post(`/v1/cad/documents/${documentId}/comments`)
      .set('Authorization', auth)
      .send({
        body: 'Revisar cota',
        anchor: { x: 120, y: 40, entityId: 'line-1' },
        reviewSessionId: sessionId,
      })
      .expect(201);
    expect(anchored.body.anchor).toEqual({ x: 120, y: 40, entityId: 'line-1' });

    // Cuerpo vacío tras trim → 400.
    await request(server)
      .post(`/v1/cad/documents/${documentId}/comments`)
      .set('Authorization', auth)
      .send({ body: '   ' })
      .expect(400);

    // Sesión de OTRO documento → 404.
    const otherDoc = await createDocument('Otro plano');
    await request(server)
      .post(`/v1/cad/documents/${otherDoc}/comments`)
      .set('Authorization', auth)
      .send({ body: 'cruzado', reviewSessionId: sessionId })
      .expect(404);

    // Filtros: por sesión y por resolved.
    const bySession = await request(server)
      .get(`/v1/cad/documents/${documentId}/comments`)
      .query({ reviewSessionId: sessionId })
      .set('Authorization', auth)
      .expect(200);
    expect(bySession.body.items).toHaveLength(1);

    const resolved = await request(server)
      .post(`/v1/cad/comments/${anchored.body.id}/resolve`)
      .set('Authorization', auth)
      .expect(201);
    expect(resolved.body.resolved).toBe(true);
    // Idempotente.
    await request(server)
      .post(`/v1/cad/comments/${anchored.body.id}/resolve`)
      .set('Authorization', auth)
      .expect(201);

    const unresolved = await request(server)
      .get(`/v1/cad/documents/${documentId}/comments`)
      .query({ resolved: 'false' })
      .set('Authorization', auth)
      .expect(200);
    expect(unresolved.body.items).toHaveLength(1);
    expect(unresolved.body.items[0].id).toBe(direct.body.id);

    // Cerrar la sesión: comentar en ella pasa a ser 400 contractual.
    await request(server)
      .post(`/v1/cad/review-sessions/${sessionId}/close`)
      .set('Authorization', auth)
      .expect(201);
    const closedComment = await request(server)
      .post(`/v1/cad/documents/${documentId}/comments`)
      .set('Authorization', auth)
      .send({ body: 'tarde', reviewSessionId: sessionId })
      .expect(400);
    expect(closedComment.body.code).toBe('review_session_closed');

    // Cerrar dos veces → 409 contractual.
    const reclose = await request(server)
      .post(`/v1/cad/review-sessions/${sessionId}/close`)
      .set('Authorization', auth)
      .expect(409);
    expect(reclose.body.code).toBe('review_session_closed');
  });

  it('la superficie de review exige cad:review (y audita la denegación CON tenant)', async () => {
    const documentId = await createDocument();
    const res = await request(app.getHttpServer())
      .get(`/v1/cad/documents/${documentId}/review-sessions`)
      .set('Authorization', `Bearer ${token(['cad:view'])}`)
      .expect(403);
    expect(res.body).toMatchObject({
      code: 'entitlement_required',
      details: {
        reason: 'permission_denied',
        requiredPermission: 'cad:review',
      },
    });
    // El asiento de la denegación quedó estampado con el tenant del actor
    // (el guard corre antes del TenantInterceptor: sin el fix de Fase 5 el
    // tenant quedaba NULL y recent() del tenant no lo veía).
    const entries = await auditEntries('tenant-a');
    const denial = entries.find((e) => e.action === 'PERMISSION_DENIED');
    expect(denial).toBeDefined();
    expect(denial!.tenantId).toBe('tenant-a');
    expect(denial!.actor).toBe('autor@test');
  });

  /* ─────────────── Escenario e2e del mandato (review link) ──────────────── */

  it('e2e review-link: crear → canjear en contexto limpio → read-only impuesto → comentar → revocar → el canje muere', async () => {
    const documentId = await createDocument('Plano compartido');
    await saveContent(documentId);
    const auth = `Bearer ${full()}`;
    const server = app.getHttpServer();

    // 1) CREAR la sesión con link (token server-owned, única aparición).
    const created = await request(server)
      .post(`/v1/cad/documents/${documentId}/review-sessions`)
      .set('Authorization', auth)
      .send({ shareLink: true })
      .expect(201);
    const shareToken = created.body.shareToken as string;
    const sessionId = created.body.session.id as string;
    expect(shareToken).toBeDefined();

    // 2) CANJEAR en contexto limpio: SOLO el token, sin Authorization.
    const context = await request(server)
      .get('/v1/cad/review/context')
      .set('X-Review-Token', shareToken)
      .expect(200);
    expect(context.body.readOnly).toBe(true);
    expect(context.body.session).toMatchObject({
      id: sessionId,
      documentId,
      hasShareLink: true,
    });
    // El documento llega HIDRATADO y en proyección reducida (sin metadatos
    // internos del autor).
    expect(context.body.document.id).toBe(documentId);
    expect(context.body.document.cadDocument.entities).toHaveLength(1);
    expect(context.body.document).not.toHaveProperty('createdBy');
    expect(JSON.stringify(context.body)).not.toContain('tokenHash');

    // 3) READ-ONLY IMPUESTO POR BACKEND: cualquier ruta fuera de la
    //    superficie del link — mutación O lectura — es 403 review_read_only,
    //    aunque "el frontend" lo intente.
    const attempts: Array<[string, string, unknown?]> = [
      [
        'put',
        `/v1/cad/documents/${documentId}/content`,
        {
          cadDocument: { meta: { schema: 3 }, entities: [] },
          expectedCadDocumentVersion: 1,
        },
      ],
      ['patch', `/v1/cad/documents/${documentId}`, { name: 'hackeado' }],
      ['delete', `/v1/cad/documents/${documentId}`],
      [
        'post',
        `/v1/cad/documents/${documentId}/publications`,
        {
          expectedCadDocumentVersion: 1,
          paperSpaceIds: ['s1'],
          fileName: 'x.pdf',
          sha256: 'a'.repeat(64),
          bytes: 10,
        },
      ],
      [
        'put',
        `/v1/cad/documents/${documentId}/dxf`,
        { name: 'x.dxf', data: '0' },
      ],
      ['get', `/v1/cad/documents/${documentId}`],
      ['get', '/v1/cad/projects'],
      ['get', '/v1/cad/blocks'],
      ['post', '/v1/cad/blocks', { name: 'bloque' }],
      ['get', `/v1/cad/documents/${documentId}/export/dxf`],
    ];
    for (const [method, path, body] of attempts) {
      const req = (
        request(server) as unknown as Record<
          string,
          (url: string) => request.Test
        >
      )
        [method](path)
        .set('X-Review-Token', shareToken);
      const res =
        body !== undefined ? await req.send(body as object) : await req;
      expect(`${method} ${path} → ${res.status}`).toBe(
        `${method} ${path} → 403`,
      );
      expect(res.body.code).toBe('review_read_only');
    }
    // El documento NO cambió (la versión CAS sigue en 1).
    const untouched = await request(server)
      .get(`/v1/cad/documents/${documentId}`)
      .set('Authorization', auth)
      .expect(200);
    expect(untouched.body.cadDocumentVersion).toBe(1);
    expect(untouched.body.name).toBe('Plano compartido');

    // 4) COMENTAR desde el link (la sesión lo permite por default) + listar
    //    + resolver dentro del hilo de la sesión.
    const guestComment = await request(server)
      .post('/v1/cad/review/comments')
      .set('X-Review-Token', shareToken)
      .send({ body: 'Falta cota en la banda', anchor: { x: 10, y: 20 } })
      .expect(201);
    expect(guestComment.body).toMatchObject({
      documentId,
      reviewSessionId: sessionId,
      author: `review-link:${sessionId}`,
      resolved: false,
    });
    const guestList = await request(server)
      .get('/v1/cad/review/comments')
      .set('X-Review-Token', shareToken)
      .expect(200);
    expect(guestList.body.items).toHaveLength(1);
    await request(server)
      .post(`/v1/cad/review/comments/${guestComment.body.id}/resolve`)
      .set('X-Review-Token', shareToken)
      .expect(201);

    // El autor ve el comentario del invitado en el hilo del documento.
    const authorView = await request(server)
      .get(`/v1/cad/documents/${documentId}/comments`)
      .query({ reviewSessionId: sessionId })
      .set('Authorization', auth)
      .expect(200);
    expect(authorView.body.items).toHaveLength(1);
    expect(authorView.body.items[0].author).toBe(`review-link:${sessionId}`);

    // 5) REVOCAR: cerrar la sesión estampa revokedAt…
    const closed = await request(server)
      .post(`/v1/cad/review-sessions/${sessionId}/close`)
      .set('Authorization', auth)
      .expect(201);
    expect(closed.body.status).toBe('closed');
    expect(closed.body.revokedAt).not.toBeNull();

    // 6) …y el CANJE MUERE de inmediato (cada request re-valida la fila).
    const dead = await request(server)
      .get('/v1/cad/review/context')
      .set('X-Review-Token', shareToken)
      .expect(401);
    expect(dead.body.code).toBe('review_token_revoked');
    const deadComment = await request(server)
      .post('/v1/cad/review/comments')
      .set('X-Review-Token', shareToken)
      .send({ body: 'tarde' })
      .expect(401);
    expect(deadComment.body.code).toBe('review_token_revoked');

    // AUDITORÍA server-owned del ciclo completo — sin el token por ningún
    // lado (ni en claro ni hash) y con el tenant estampado.
    const entries = await auditEntries();
    const actions = entries.map((e) => e.action);
    for (const expected of [
      'cad_review_session_created',
      'cad_review_link_redeemed',
      'cad_comment_created',
      'cad_comment_resolved',
      'cad_review_session_closed',
      'cad_review_link_denied',
      'REVIEW_ACCESS_DENIED',
    ]) {
      expect(actions).toContain(expected);
    }
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain(shareToken);
    const denied = entries.find((e) => e.action === 'cad_review_link_denied');
    expect(denied!.tenantId).toBe('tenant-a');
    expect(denied!.payload).toMatchObject({ reason: 'review_token_revoked' });
    const readOnlyDenial = entries.find(
      (e) => e.action === 'REVIEW_ACCESS_DENIED',
    );
    expect(readOnlyDenial!.tenantId).toBe('tenant-a');
  });

  /* ───────────── Expiración, tokens inválidos y allowComments ───────────── */

  it('la expiración se comprueba server-side: link vencido = 401 review_token_expired (auditado)', async () => {
    const documentId = await createDocument('Plano expirable');
    const created = await request(app.getHttpServer())
      .post(`/v1/cad/documents/${documentId}/review-sessions`)
      .set('Authorization', `Bearer ${full()}`)
      .send({ shareLink: true, shareLinkTtlMinutes: 5 })
      .expect(201);
    const shareToken = created.body.shareToken as string;

    // Vigente: canjea.
    await request(app.getHttpServer())
      .get('/v1/cad/review/context')
      .set('X-Review-Token', shareToken)
      .expect(200);

    // El servidor decide la expiración: vencerla en la base mata el token
    // aunque el cliente "conozca" el claro.
    await dataSource
      .getRepository(CadReviewSession)
      .update(
        { id: created.body.session.id },
        { expiresAt: new Date(Date.now() - 1_000) },
      );
    const expired = await request(app.getHttpServer())
      .get('/v1/cad/review/context')
      .set('X-Review-Token', shareToken)
      .expect(401);
    expect(expired.body.code).toBe('review_token_expired');

    const entries = await auditEntries();
    expect(
      entries.some(
        (e) =>
          e.action === 'cad_review_link_denied' &&
          (e.payload as { reason?: string })?.reason === 'review_token_expired',
      ),
    ).toBe(true);
  });

  it('tokens malformados o desconocidos → 401 review_token_invalid; un JWT no abre la superficie del invitado', async () => {
    const server = app.getHttpServer();
    // Desconocido con forma plausible.
    const unknown = await request(server)
      .get('/v1/cad/review/context')
      .set('X-Review-Token', `vdrl_${'x'.repeat(43)}`)
      .expect(401);
    expect(unknown.body.code).toBe('review_token_invalid');
    // Malformado (corto): ni siquiera consulta la base.
    await request(server)
      .get('/v1/cad/review/context')
      .set('X-Review-Token', 'corto')
      .expect(401);
    // Sin credencial alguna.
    await request(server).get('/v1/cad/review/context').expect(401);
    // Un JWT válido NO produce contexto de review (el Bearer siempre gana).
    const jwtRes = await request(server)
      .get('/v1/cad/review/context')
      .set('Authorization', `Bearer ${full()}`)
      .expect(401);
    expect(jwtRes.body.code).toBe('review_token_invalid');
  });

  it('allowComments: false deja el link en solo-vista — comentar/resolver = 403 review_comments_disabled', async () => {
    const documentId = await createDocument('Plano solo vista');
    const created = await request(app.getHttpServer())
      .post(`/v1/cad/documents/${documentId}/review-sessions`)
      .set('Authorization', `Bearer ${full()}`)
      .send({ shareLink: true, allowComments: false })
      .expect(201);
    const shareToken = created.body.shareToken as string;
    expect(created.body.session.allowComments).toBe(false);

    // Ver sí; comentar no.
    await request(app.getHttpServer())
      .get('/v1/cad/review/context')
      .set('X-Review-Token', shareToken)
      .expect(200);
    const denied = await request(app.getHttpServer())
      .post('/v1/cad/review/comments')
      .set('X-Review-Token', shareToken)
      .send({ body: 'no debería' })
      .expect(403);
    expect(denied.body.code).toBe('review_comments_disabled');
  });
});
