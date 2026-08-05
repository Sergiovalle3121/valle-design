import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { gzipSync } from 'node:zlib';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import {
  FIRST_PARTY_AUTH_ENTITY_GRAPH,
  type FirstPartyCadActor,
  seedFirstPartyCadActor,
} from '../../common/testing/first-party-cad-auth';
import { TenantModule } from '../../common/tenant/tenant.module';
import { CadAuthGuard } from '../auth/guards/cad-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { DesignAuditLog } from '../audit-log/design-audit-log.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { BlobStoreModule } from '../blob-store/blob-store.module';
import { CadDocumentsModule } from '../cad-documents/cad-documents.module';
import { IdentityModule } from '../identity/identity.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { CadModule } from './cad.module';

/**
 * Prueba de la superficie /v1/cad/* con el stack REAL: guards globales
 * (CadAuthGuard + PermissionsGuard), TenantInterceptor, pipe de validación y
 * SQLite en memoria. La cookie opaca, organización activa, membresía, rol y
 * entitlement se resuelven desde las tablas first-party reales.
 */
describe('CadController (/v1/cad, stack completo)', () => {
  jest.setTimeout(30_000);

  let app: NestExpressApplication;
  let owner: FirstPartyCadActor;
  let member: FirstPartyCadActor;
  let viewer: FirstPartyCadActor;
  let withoutOrganization: FirstPartyCadActor;
  let withoutEntitlement: FirstPartyCadActor;

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
    const dataSource = app.get(DataSource);
    owner = await seedFirstPartyCadActor(dataSource, {
      email: 'cad-owner@test.invalid',
      role: 'owner',
    });
    member = await seedFirstPartyCadActor(dataSource, {
      email: 'cad-member@test.invalid',
      role: 'member',
    });
    viewer = await seedFirstPartyCadActor(dataSource, {
      email: 'cad-viewer@test.invalid',
      role: 'viewer',
    });
    withoutOrganization = await seedFirstPartyCadActor(dataSource, {
      email: 'cad-no-org@test.invalid',
      withOrganization: false,
    });
    withoutEntitlement = await seedFirstPartyCadActor(dataSource, {
      email: 'cad-no-entitlement@test.invalid',
      entitled: false,
    });
  });

  afterAll(async () => {
    delete process.env.AI_MOCK;
    await app.close();
  });

  it('sin cookie de sesión la superficie responde 401', async () => {
    await request(app.getHttpServer()).get('/v1/cad/projects').expect(401);
  });

  it('un viewer no puede escribir aunque falsifique headers de tenant o permisos', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/cad/projects')
      .set(viewer.headers)
      .set('X-Tenant-Id', owner.organizationId!)
      .set('X-Permissions', 'cad:admin,cad:edit')
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

  it('un editor descarta su provisional sin recibir cad:admin para el borrado general', async () => {
    const server = app.getHttpServer();
    const provisional = await request(server)
      .post('/v1/cad/documents')
      .set(member.headers)
      .send({ name: 'Rollback de importación' })
      .expect(201);
    const provisionalId = (provisional.body as { id: string }).id;

    await request(server)
      .delete(`/v1/cad/documents/${provisionalId}`)
      .set(member.headers)
      .expect(403);
    await request(server)
      .delete(`/v1/cad/documents/${provisionalId}/provisional`)
      .set(member.headers)
      .expect(204);
    await request(server)
      .get(`/v1/cad/documents/${provisionalId}`)
      .set(member.headers)
      .expect(404);
  });

  it('una sesión sin organización activa falla cerrada con 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/cad/projects')
      .set(withoutOrganization.headers)
      .expect(403);
    expect(res.body).toMatchObject({
      code: 'entitlement_required',
      details: { reason: 'not_entitled' },
    });
  });

  it('una organización sin suscripción design.cad falla cerrada con 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/cad/projects')
      .set(withoutEntitlement.headers)
      .expect(403);
    expect(res.body).toMatchObject({
      code: 'entitlement_required',
      details: { reason: 'not_entitled' },
    });
  });

  it('un viewer puede leer con permisos derivados server-side', async () => {
    await request(app.getHttpServer())
      .get('/v1/cad/projects')
      .set(viewer.headers)
      .expect(200);
  });

  it('acepta model+revision como filtros exactos del listado de documentos', async () => {
    const auth = owner.headers;
    const server = app.getHttpServer();
    const target = await request(server)
      .post('/v1/cad/documents')
      .set(auth)
      .send({
        name: 'Documento histórico',
        model: 'AXOS-CAD-STUDIO',
        revision: 'UNIVERSAL',
      })
      .expect(201);
    await request(server)
      .post('/v1/cad/documents')
      .set(auth)
      .send({
        name: 'Modelo parecido',
        model: 'AXOS-CAD-STUDIO-ARCHIVE',
        revision: 'UNIVERSAL',
      })
      .expect(201);
    await request(server)
      .post('/v1/cad/documents')
      .set(auth)
      .send({
        name: 'Revisión parecida',
        model: 'AXOS-CAD-STUDIO',
        revision: 'UNIVERSAL-OLD',
      })
      .expect(201);

    const exact = await request(server)
      .get('/v1/cad/documents?model=AXOS-CAD-STUDIO&revision=UNIVERSAL&limit=1')
      .set(auth)
      .expect(200);
    const exactBody = exact.body as {
      total: number;
      items: Array<{ id: string }>;
    };
    const targetBody = target.body as { id: string };
    expect(exactBody.total).toBe(1);
    expect(exactBody.items.map((item) => item.id)).toEqual([targetBody.id]);

    await request(server)
      .get(`/v1/cad/documents?model=${'x'.repeat(65)}`)
      .set(auth)
      .expect(400);
  });

  it('ciclo completo: proyecto → documento → CAS → 409 stale → versiones → publicación', async () => {
    const auth = owner.headers;
    const server = app.getHttpServer();

    const project = await request(server)
      .post('/v1/cad/projects')
      .set(auth)
      .send({ name: 'Planta demo', description: 'Nave 1' })
      .expect(201);
    expect(project.body).toMatchObject({
      name: 'Planta demo',
      status: 'active',
    });

    const document = await request(server)
      .post('/v1/cad/documents')
      .set(auth)
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
          layer: '0',
        },
      ],
      paperSpaces: [{ id: 'sheet-1', page: { width: 297, height: 210 } }],
    };
    const saved = await request(server)
      .put(`/v1/cad/documents/${document.body.id}/content`)
      .set(auth)
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
      .set(auth)
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
      .set(auth)
      .expect(200);
    expect(opened.body.cadDocumentVersion).toBe(1);
    expect(opened.body.cadDocument.entities).toHaveLength(1);
    expect(opened.body.dxf).toBeNull();

    // Historial.
    const versions = await request(server)
      .get(`/v1/cad/documents/${document.body.id}/versions`)
      .set(auth)
      .expect(200);
    expect(versions.body.total).toBe(1);
    expect(versions.body.items[0]).toMatchObject({ version: 1 });

    // Publicación (CAS + recibo inmutable).
    const publication = await request(server)
      .post(`/v1/cad/documents/${document.body.id}/publications`)
      .set(auth)
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
      publishedBy: owner.email,
      cadDocumentVersion: 2,
    });

    const publications = await request(server)
      .get(`/v1/cad/documents/${document.body.id}/publications`)
      .set(auth)
      .expect(200);
    expect(publications.body.items).toHaveLength(1);

    // La denegación previa quedó en la bitácora propia (auditoría real).
    const audit = app.get(DesignAuditLog);
    const tenantCtx = app.get(TenantContextService);
    const entries = await tenantCtx.run(
      {
        tenant_id: owner.organizationId,
        organization_id: owner.organizationId,
        plant_id: null,
        user_email: owner.email,
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
    const auth = owner.headers;
    const server = app.getHttpServer();
    const SECRET = 'vdrl_token_heredado_del_navegador';

    const document = await request(server)
      .post('/v1/cad/documents')
      .set(auth)
      .send({ name: 'Plano con review link' })
      .expect(201);
    const documentId = document.body.id as string;

    // 1) INGRESO: el cliente aún manda el token en claro dentro del JSON.
    //    Se acepta (no se rompe el guardado) pero NO se persiste.
    const cadDocument = {
      meta: { schema: 3, version: 1, unit: 'mm' },
      // Geometría bien formada: este caso mide la REDACCIÓN del token, no la
      // validación, pero una línea sin extremos ni capa ya no cruza la
      // frontera — y no debería haberlo hecho nunca.
      entities: [
        {
          id: 'line-1',
          type: 'line',
          start: { x: 0, y: 0 },
          end: { x: 1000, y: 0 },
          layer: '0',
        },
      ],
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
      .set(auth)
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
      .set(auth)
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
      .set(auth)
      .expect(200);
    expect(JSON.stringify(version.body)).not.toContain(SECRET);
    expect(
      'token' in version.body.cadDocument.collaboration.reviewLinks[0],
    ).toBe(false);
  });

  it('guarda el archivo gzip multipart mediante CAS (rama /archive)', async () => {
    const auth = owner.headers;
    const server = app.getHttpServer();

    const document = await request(server)
      .post('/v1/cad/documents')
      .set(auth)
      .send({ name: 'Plano grande' })
      .expect(201);

    const cadDocument = {
      meta: { schema: 3, version: 1, unit: 'mm' },
      entities: [
        { id: 'e1', type: 'box', x: 0, y: 0, w: 100, h: 50, layer: '0' },
        { id: 'e2', type: 'box', x: 200, y: 0, w: 100, h: 50, layer: '0' },
      ],
    };
    const gz = gzipSync(Buffer.from(JSON.stringify(cadDocument), 'utf8'));

    // Sin payload → 400 contractual cad_document_version_required.
    const missing = await request(server)
      .put(`/v1/cad/documents/${document.body.id}/archive`)
      .set(auth)
      .attach('file', gz, 'documento.json.gz')
      .expect(400);
    expect(missing.body).toMatchObject({
      code: 'cad_document_version_required',
    });

    const saved = await request(server)
      .put(`/v1/cad/documents/${document.body.id}/archive`)
      .set(auth)
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
      .set(auth)
      .expect(200);
    expect(opened.body.cadDocument._storage).toBeUndefined();
    expect(opened.body.cadDocument).toEqual(cadDocument);

    // El historial CAS también rehidrata la versión archivada.
    const version = await request(server)
      .get(`/v1/cad/documents/${document.body.id}/versions/1`)
      .set(auth)
      .expect(200);
    expect(version.body.cadDocument).toEqual(cadDocument);
  });

  it('round-trip real >1MB: el contenido inline se persiste como blob y se abre hidratado', async () => {
    const auth = owner.headers;
    const server = app.getHttpServer();

    const document = await request(server)
      .post('/v1/cad/documents')
      .set(auth)
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
      .set(auth)
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
      .set(auth)
      .expect(200);
    expect(opened.body.cadDocumentVersion).toBe(1);
    expect(opened.body.cadDocument._storage).toBeUndefined();
    expect(opened.body.cadDocument.entities).toHaveLength(12_000);
    expect(opened.body.cadDocument).toEqual(cadDocument);

    // El CAS sigue operando sobre el documento hidratado: eco + guardado.
    const again = await request(server)
      .put(`/v1/cad/documents/${document.body.id}/content`)
      .set(auth)
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
    const auth = owner.headers;
    const server = app.getHttpServer();

    const document = await request(server)
      .post('/v1/cad/documents')
      .set(auth)
      .send({ name: 'Con fondo' })
      .expect(201);

    await request(server)
      .get(`/v1/cad/documents/${document.body.id}/dxf`)
      .set(auth)
      .expect(404);

    const dxfText = '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n';
    const uploaded = await request(server)
      .put(`/v1/cad/documents/${document.body.id}/dxf`)
      .set(auth)
      .send({ name: 'fondo.dxf', data: dxfText, placement: { scale: 2 } })
      .expect(200);
    expect(uploaded.body).toMatchObject({
      name: 'fondo.dxf',
      placement: { scale: 2, visible: true },
    });

    // ADITIVO R3: la apertura expone la colocación del plano (sin los datos).
    const openedWithDxf = await request(server)
      .get(`/v1/cad/documents/${document.body.id}`)
      .set(auth)
      .expect(200);
    expect(openedWithDxf.body.dxf).toMatchObject({
      name: 'fondo.dxf',
      scale: 2,
      visible: true,
    });
    expect(openedWithDxf.body.dxf.data).toBeUndefined();

    await request(server)
      .delete(`/v1/cad/documents/${document.body.id}/dxf`)
      .set(auth)
      .expect(204);

    await request(server)
      .get(`/v1/cad/documents/${document.body.id}/dxf`)
      .set(auth)
      .expect(404);

    const exported = await request(server)
      .get(`/v1/cad/documents/${document.body.id}/export/dxf`)
      .set(auth)
      .expect(200);
    expect(exported.body.fileName).toMatch(/\.dxf$/);
    expect(exported.body.dxf).toContain('SECTION');
    expect(exported.body.dxf).toContain('EOF');
  });

  it('biblioteca de bloques: crear, listar, obtener, redefinir y borrar', async () => {
    const auth = owner.headers;
    const server = app.getHttpServer();

    const created = await request(server)
      .post('/v1/cad/blocks')
      .set(auth)
      .send({
        name: 'Conveyor',
        assets: [{ id: 'a1', kind: 'box', x: 0, y: 0, w: 100, h: 40 }],
      })
      .expect(201);
    expect(created.body).toMatchObject({ name: 'Conveyor', version: 1 });

    const listed = await request(server)
      .get('/v1/cad/blocks?q=conveyor')
      .set(auth)
      .expect(200);
    expect(listed.body.items).toHaveLength(1);

    await request(server)
      .get(`/v1/cad/blocks/${created.body.id}`)
      .set(auth)
      .expect(200);

    const renamed = await request(server)
      .patch(`/v1/cad/blocks/${created.body.id}`)
      .set(auth)
      .send({ name: 'Conveyor v2' })
      .expect(200);
    expect(renamed.body.name).toBe('Conveyor v2');

    await request(server)
      .delete(`/v1/cad/blocks/${created.body.id}`)
      .set(auth)
      .expect(204);
  });

  it('intent degrada determinista en AI_MOCK (sin red, sin 500)', async () => {
    const auth = owner.headers;
    const server = app.getHttpServer();
    const document = await request(server)
      .post('/v1/cad/documents')
      .set(auth)
      .send({ name: 'Con copiloto' })
      .expect(201);

    const intent = await request(server)
      .post(`/v1/cad/documents/${document.body.id}/intent`)
      .set(auth)
      .send({ prompt: 'Alinea las estaciones en L' })
      .expect(201);
    expect(intent.body).toMatchObject({ available: false, toolCalls: [] });
  });
});
