import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { gzipSync } from 'node:zlib';
import request from 'supertest';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { TenantModule } from '../../common/tenant/tenant.module';
import { AuthModule } from '../auth/auth.module';
import { CadAuthGuard } from '../auth/guards/cad-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { DesignAuditLog } from '../audit-log/design-audit-log.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { BlobStoreModule } from '../blob-store/blob-store.module';
import { CadDocumentsModule } from '../cad-documents/cad-documents.module';
import { CadModule } from './cad.module';

/**
 * Prueba de la superficie /v1/cad/* con el stack REAL: guards globales
 * (CadAuthGuard + PermissionsGuard), TenantInterceptor, pipe de validación y
 * SQLite en memoria. Los tokens se firman con el MISMO secreto de dev que
 * verifica el guard (contrato Platform→Design).
 */
describe('CadController (/v1/cad, stack completo)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let jwt: JwtService;

  const token = (permissions: string[] | null, role = '') =>
    jwt.sign({
      sub: 'user-1',
      email: 'cad@test',
      role,
      tenant_id: 'tenant-a',
      organization_id: null,
      plant_id: null,
      permissions,
      scopes: null,
    });

  const full = () =>
    token(['cad:view', 'cad:edit', 'cad:review', 'cad:publish', 'cad:admin']);

  beforeAll(async () => {
    process.env.AI_MOCK = '1';
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

    app = moduleRef.createNestApplication();
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
    delete process.env.AI_MOCK;
    await app.close();
  });

  it('sin bearer token la superficie responde 401', async () => {
    await request(app.getHttpServer()).get('/v1/cad/projects').expect(401);
  });

  it('sin el permiso cad:* requerido responde el 403 contractual', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/cad/projects')
      .set('Authorization', `Bearer ${token(['cad:view'])}`)
      .send({ name: 'Planta' })
      .expect(403);
    expect(res.body).toMatchObject({
      code: 'entitlement_required',
      details: {
        reason: 'permission_denied',
        requiredPermission: 'cad:edit',
      },
    });
  });

  it('en modo platform-api (sin cliente aún) el 403 es not_entitled fail-closed', async () => {
    process.env.ENTITLEMENTS_MODE = 'platform-api';
    try {
      const res = await request(app.getHttpServer())
        .get('/v1/cad/projects')
        .set('Authorization', `Bearer ${full()}`)
        .expect(403);
      expect(res.body).toMatchObject({
        code: 'entitlement_required',
        details: { reason: 'not_entitled' },
      });
    } finally {
      delete process.env.ENTITLEMENTS_MODE;
    }
  });

  it('el mapeo de transición engineering:read → cad:view permite leer', async () => {
    await request(app.getHttpServer())
      .get('/v1/cad/projects')
      .set('Authorization', `Bearer ${token(['engineering:read'])}`)
      .expect(200);
  });

  it('ciclo completo: proyecto → documento → CAS → 409 stale → versiones → publicación', async () => {
    const auth = `Bearer ${full()}`;
    const server = app.getHttpServer();

    const project = await request(server)
      .post('/v1/cad/projects')
      .set('Authorization', auth)
      .send({ name: 'Planta demo', description: 'Nave 1' })
      .expect(201);
    expect(project.body).toMatchObject({
      name: 'Planta demo',
      status: 'active',
    });

    const document = await request(server)
      .post('/v1/cad/documents')
      .set('Authorization', auth)
      .send({ name: 'Plano', projectId: project.body.id })
      .expect(201);
    expect(document.body.cadDocumentVersion).toBe(0);

    const cadDocument = {
      meta: { schema: 3, version: 1, unit: 'mm' },
      entities: [
        {
          id: 'line-1',
          type: 'line',
          start: { x: 0, y: 0 },
          end: { x: 1000, y: 0 },
        },
      ],
      paperSpaces: [{ id: 'sheet-1', page: { width: 297, height: 210 } }],
    };
    const saved = await request(server)
      .put(`/v1/cad/documents/${document.body.id}/content`)
      .set('Authorization', auth)
      .send({ cadDocument, expectedCadDocumentVersion: 0 })
      .expect(200);
    expect(saved.body).toMatchObject({
      cadDocumentVersion: 1,
      entityCount: 1,
      storedAsBlobPointer: false,
    });

    // Escritor desfasado → 409 contractual.
    const conflict = await request(server)
      .put(`/v1/cad/documents/${document.body.id}/content`)
      .set('Authorization', auth)
      .send({ cadDocument, expectedCadDocumentVersion: 0 })
      .expect(409);
    expect(conflict.body).toMatchObject({
      code: 'cad_document_version_conflict',
      expected: 0,
      current: 1,
    });

    // Abrir devuelve el documento + token CAS.
    const opened = await request(server)
      .get(`/v1/cad/documents/${document.body.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(opened.body.cadDocumentVersion).toBe(1);
    expect(opened.body.cadDocument.entities).toHaveLength(1);

    // Historial.
    const versions = await request(server)
      .get(`/v1/cad/documents/${document.body.id}/versions`)
      .set('Authorization', auth)
      .expect(200);
    expect(versions.body.total).toBe(1);
    expect(versions.body.items[0]).toMatchObject({ version: 1 });

    // Publicación (CAS + recibo inmutable).
    const publication = await request(server)
      .post(`/v1/cad/documents/${document.body.id}/publications`)
      .set('Authorization', auth)
      .send({
        expectedCadDocumentVersion: 1,
        paperSpaceIds: ['sheet-1'],
        fileName: 'plano.pdf',
        sha256: 'a'.repeat(64),
        bytes: 2048,
      })
      .expect(201);
    expect(publication.body).toMatchObject({
      fileName: 'plano.pdf',
      publishedBy: 'cad@test',
      cadDocumentVersion: 2,
    });

    const publications = await request(server)
      .get(`/v1/cad/documents/${document.body.id}/publications`)
      .set('Authorization', auth)
      .expect(200);
    expect(publications.body.items).toHaveLength(1);

    // La denegación previa quedó en la bitácora propia (auditoría real).
    const audit = app.get(DesignAuditLog);
    const tenantCtx = app.get(TenantContextService);
    const entries = await tenantCtx.run(
      {
        tenant_id: 'tenant-a',
        organization_id: null,
        plant_id: null,
        user_email: 'spec@test',
        role: null,
        permissions: null,
        scopes: null,
      },
      () => audit.recent(50),
    );
    expect(entries.some((e) => e.action === 'cad_document_saved')).toBe(true);
    expect(entries.some((e) => e.action === 'cad_sheet_set_published')).toBe(
      true,
    );
  });

  it('guarda el archivo gzip multipart mediante CAS (rama /archive)', async () => {
    const auth = `Bearer ${full()}`;
    const server = app.getHttpServer();

    const document = await request(server)
      .post('/v1/cad/documents')
      .set('Authorization', auth)
      .send({ name: 'Plano grande' })
      .expect(201);

    const cadDocument = {
      meta: { schema: 3, version: 1, unit: 'mm' },
      entities: [
        { id: 'e1', type: 'box', x: 0, y: 0, w: 100, h: 50 },
        { id: 'e2', type: 'box', x: 200, y: 0, w: 100, h: 50 },
      ],
    };
    const gz = gzipSync(Buffer.from(JSON.stringify(cadDocument), 'utf8'));

    // Sin payload → 400 contractual cad_document_version_required.
    const missing = await request(server)
      .put(`/v1/cad/documents/${document.body.id}/archive`)
      .set('Authorization', auth)
      .attach('file', gz, 'documento.json.gz')
      .expect(400);
    expect(missing.body).toMatchObject({
      code: 'cad_document_version_required',
    });

    const saved = await request(server)
      .put(`/v1/cad/documents/${document.body.id}/archive`)
      .set('Authorization', auth)
      .field('payload', JSON.stringify({ expectedCadDocumentVersion: 0 }))
      .attach('file', gz, 'documento.json.gz')
      .expect(200);
    expect(saved.body).toMatchObject({
      cadDocumentVersion: 1,
      entityCount: 2,
      storedAsBlobPointer: true,
    });

    // El documento rehidratable: abrir expone el puntero _storage.
    const opened = await request(server)
      .get(`/v1/cad/documents/${document.body.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(opened.body.cadDocument._storage).toMatchObject({
      kind: 'document_blob',
      encoding: 'gzip',
    });
  });

  it('plano DXF de fondo: put/get/delete y exportación DXF R12', async () => {
    const auth = `Bearer ${full()}`;
    const server = app.getHttpServer();

    const document = await request(server)
      .post('/v1/cad/documents')
      .set('Authorization', auth)
      .send({ name: 'Con fondo' })
      .expect(201);

    await request(server)
      .get(`/v1/cad/documents/${document.body.id}/dxf`)
      .set('Authorization', auth)
      .expect(404);

    const dxfText = '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n';
    const uploaded = await request(server)
      .put(`/v1/cad/documents/${document.body.id}/dxf`)
      .set('Authorization', auth)
      .send({ name: 'fondo.dxf', data: dxfText, placement: { scale: 2 } })
      .expect(200);
    expect(uploaded.body).toMatchObject({
      name: 'fondo.dxf',
      placement: { scale: 2, visible: true },
    });

    await request(server)
      .delete(`/v1/cad/documents/${document.body.id}/dxf`)
      .set('Authorization', auth)
      .expect(204);

    await request(server)
      .get(`/v1/cad/documents/${document.body.id}/dxf`)
      .set('Authorization', auth)
      .expect(404);

    const exported = await request(server)
      .get(`/v1/cad/documents/${document.body.id}/export/dxf`)
      .set('Authorization', auth)
      .expect(200);
    expect(exported.body.fileName).toMatch(/\.dxf$/);
    expect(exported.body.dxf).toContain('SECTION');
    expect(exported.body.dxf).toContain('EOF');
  });

  it('biblioteca de bloques: crear, listar, obtener, redefinir y borrar', async () => {
    const auth = `Bearer ${full()}`;
    const server = app.getHttpServer();

    const created = await request(server)
      .post('/v1/cad/blocks')
      .set('Authorization', auth)
      .send({
        name: 'Conveyor',
        assets: [{ id: 'a1', kind: 'box', x: 0, y: 0, w: 100, h: 40 }],
      })
      .expect(201);
    expect(created.body).toMatchObject({ name: 'Conveyor', version: 1 });

    const listed = await request(server)
      .get('/v1/cad/blocks?q=conveyor')
      .set('Authorization', auth)
      .expect(200);
    expect(listed.body.items).toHaveLength(1);

    await request(server)
      .get(`/v1/cad/blocks/${created.body.id}`)
      .set('Authorization', auth)
      .expect(200);

    const renamed = await request(server)
      .patch(`/v1/cad/blocks/${created.body.id}`)
      .set('Authorization', auth)
      .send({ name: 'Conveyor v2' })
      .expect(200);
    expect(renamed.body.name).toBe('Conveyor v2');

    await request(server)
      .delete(`/v1/cad/blocks/${created.body.id}`)
      .set('Authorization', auth)
      .expect(204);
  });

  it('intent degrada determinista en AI_MOCK (sin red, sin 500)', async () => {
    const auth = `Bearer ${full()}`;
    const server = app.getHttpServer();
    const document = await request(server)
      .post('/v1/cad/documents')
      .set('Authorization', auth)
      .send({ name: 'Con copiloto' })
      .expect(201);

    const intent = await request(server)
      .post(`/v1/cad/documents/${document.body.id}/intent`)
      .set('Authorization', auth)
      .send({ prompt: 'Alinea las estaciones en L' })
      .expect(201);
    expect(intent.body).toMatchObject({ available: false, toolCalls: [] });
  });
});
