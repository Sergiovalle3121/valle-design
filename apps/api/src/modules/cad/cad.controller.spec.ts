import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { gzipSync } from 'node:zlib';
import request from 'supertest';
import { DataSource } from 'typeorm';
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

  let app: NestExpressApplication;
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

    app = moduleRef.createNestApplication<NestExpressApplication>();
    // Mismo límite de cuerpo JSON que main.ts: el contrato admite documentos
    // inline de hasta 8 MB serializados (el spec >1MB lo necesita).
    app.useBodyParser('json', { limit: '16mb' });
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

  it('en modo platform-api sin PLATFORM_API_URL el 403 es not_entitled fail-closed', async () => {
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

    // Abrir devuelve el documento + token CAS (+ dxf: null — sin plano).
    const opened = await request(server)
      .get(`/v1/cad/documents/${document.body.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(opened.body.cadDocumentVersion).toBe(1);
    expect(opened.body.cadDocument.entities).toHaveLength(1);
    expect(opened.body.dxf).toBeNull();

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

  it('los review link tokens heredados NUNCA salen en la respuesta (documento ni versiones)', async () => {
    const auth = `Bearer ${full()}`;
    const server = app.getHttpServer();
    const SECRET = 'vdrl_token_heredado_del_navegador';

    const document = await request(server)
      .post('/v1/cad/documents')
      .set('Authorization', auth)
      .send({ name: 'Plano con review link' })
      .expect(201);
    const documentId = document.body.id as string;

    // 1) INGRESO: el cliente aún manda el token en claro dentro del JSON.
    //    Se acepta (no se rompe el guardado) pero NO se persiste.
    const cadDocument = {
      meta: { schema: 3, version: 1, unit: 'mm' },
      entities: [{ id: 'line-1', type: 'line' }],
      collaboration: {
        versions: [],
        threads: [],
        reviewLinks: [
          { id: 'link-1', token: SECRET, readOnly: true, label: 'Cliente' },
        ],
        audit: [],
      },
    };
    await request(server)
      .put(`/v1/cad/documents/${documentId}/content`)
      .set('Authorization', auth)
      .send({ cadDocument, expectedCadDocumentVersion: 0 })
      .expect(200);

    const source = app.get(DataSource);
    const persisted = await source.query(
      'SELECT cad_document FROM cad_documents WHERE id = ?',
      [documentId],
    );
    expect(String(persisted[0].cad_document)).not.toContain(SECRET);
    const persistedVersions = await source.query(
      'SELECT cad_document FROM cad_document_versions WHERE document_id = ?',
      [documentId],
    );
    expect(persistedVersions).toHaveLength(1);
    expect(String(persistedVersions[0].cad_document)).not.toContain(SECRET);

    // 2) SALIDA: una fila HEREDADA (escrita antes de esta limpieza, con el
    //    token en claro en el JSON) tampoco lo filtra al servirse.
    const legacy = JSON.stringify({
      ...cadDocument,
      collaboration: {
        ...cadDocument.collaboration,
        reviewLinks: [
          { id: 'link-1', token: SECRET, readOnly: true, label: 'Cliente' },
        ],
      },
    });
    await source.query(
      'UPDATE cad_documents SET cad_document = ? WHERE id = ?',
      [legacy, documentId],
    );
    await source.query(
      'UPDATE cad_document_versions SET cad_document = ? WHERE document_id = ?',
      [legacy, documentId],
    );

    const opened = await request(server)
      .get(`/v1/cad/documents/${documentId}`)
      .set('Authorization', auth)
      .expect(200);
    expect(JSON.stringify(opened.body)).not.toContain(SECRET);
    expect(opened.body.cadDocument.collaboration.reviewLinks[0]).toEqual({
      id: 'link-1',
      readOnly: true,
      label: 'Cliente',
      hasToken: true,
    });

    const version = await request(server)
      .get(`/v1/cad/documents/${documentId}/versions/1`)
      .set('Authorization', auth)
      .expect(200);
    expect(JSON.stringify(version.body)).not.toContain(SECRET);
    expect(
      'token' in version.body.cadDocument.collaboration.reviewLinks[0],
    ).toBe(false);
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

    // HIDRATACIÓN R3: aunque el documento quedó persistido como puntero a
    // blob (storedAsBlobPointer arriba), abrir devuelve el documento COMPLETO
    // rehidratado — nunca el puntero _storage (semántica del getLayout del
    // origen con includeCadDocument=true).
    const opened = await request(server)
      .get(`/v1/cad/documents/${document.body.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(opened.body.cadDocument._storage).toBeUndefined();
    expect(opened.body.cadDocument).toEqual(cadDocument);

    // El historial CAS también rehidrata la versión archivada.
    const version = await request(server)
      .get(`/v1/cad/documents/${document.body.id}/versions/1`)
      .set('Authorization', auth)
      .expect(200);
    expect(version.body.cadDocument).toEqual(cadDocument);
  });

  it('round-trip real >1MB: el contenido inline se persiste como blob y se abre hidratado', async () => {
    const auth = `Bearer ${full()}`;
    const server = app.getHttpServer();

    const document = await request(server)
      .post('/v1/cad/documents')
      .set('Authorization', auth)
      .send({ name: 'Plano gigante', model: 'PERF-1MB', revision: 'A' })
      .expect(201);

    // Documento REAL >1 MB serializado (~1.9 MB): 12k entidades con payload
    // textual. Supera CAD_DOCUMENT_BLOB_THRESHOLD_BYTES (1 MB) y queda por
    // debajo del límite inline del contrato (8 MB).
    const entities = Array.from({ length: 12_000 }, (_, index) => ({
      id: `bulk-${index}`,
      type: 'line',
      start: { x: index % 1000, y: Math.floor(index / 1000), z: 0 },
      end: { x: (index % 1000) + 50, y: Math.floor(index / 1000) + 25, z: 0 },
      layer: '0',
      note: `entidad-de-relleno-${'x'.repeat(96)}-${index}`,
    }));
    const cadDocument = {
      meta: { schema: 3, version: 1, unit: 'mm' },
      entities,
    };
    expect(
      Buffer.byteLength(JSON.stringify(cadDocument), 'utf8'),
    ).toBeGreaterThan(1_000_000);

    const saved = await request(server)
      .put(`/v1/cad/documents/${document.body.id}/content`)
      .set('Authorization', auth)
      .send({ cadDocument, expectedCadDocumentVersion: 0 })
      .expect(200);
    expect(saved.body).toMatchObject({
      cadDocumentVersion: 1,
      entityCount: 12_000,
      // El servidor decidió blob store por tamaño (dedup sha256 en design_blobs).
      storedAsBlobPointer: true,
    });

    // Apertura hidratada: el documento vuelve COMPLETO e idéntico (round-trip
    // por blob real, sin puntero expuesto al cliente).
    const opened = await request(server)
      .get(`/v1/cad/documents/${document.body.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(opened.body.cadDocumentVersion).toBe(1);
    expect(opened.body.cadDocument._storage).toBeUndefined();
    expect(opened.body.cadDocument.entities).toHaveLength(12_000);
    expect(opened.body.cadDocument).toEqual(cadDocument);

    // El CAS sigue operando sobre el documento hidratado: eco + guardado.
    const again = await request(server)
      .put(`/v1/cad/documents/${document.body.id}/content`)
      .set('Authorization', auth)
      .send({
        cadDocument: opened.body.cadDocument,
        expectedCadDocumentVersion: 1,
      })
      .expect(200);
    expect(again.body).toMatchObject({
      cadDocumentVersion: 2,
      storedAsBlobPointer: true,
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

    // ADITIVO R3: la apertura expone la colocación del plano (sin los datos).
    const openedWithDxf = await request(server)
      .get(`/v1/cad/documents/${document.body.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(openedWithDxf.body.dxf).toMatchObject({
      name: 'fondo.dxf',
      scale: 2,
      visible: true,
    });
    expect(openedWithDxf.body.dxf.data).toBeUndefined();

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
