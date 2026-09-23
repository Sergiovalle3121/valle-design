import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { FIRST_PARTY_AUTH_ENTITY_GRAPH } from '../../common/testing/first-party-cad-auth';
import { TenantModule } from '../../common/tenant/tenant.module';
import { CadAuthGuard } from '../auth/guards/cad-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { BlobStoreModule } from '../blob-store/blob-store.module';
import { CadDocumentsModule } from '../cad-documents/cad-documents.module';
import { CadDocument } from '../cad-documents/entities/cad-document.entity';
import { CadReviewSession } from '../cad-documents/entities/cad-review-session.entity';
import { hashReviewLinkToken } from '../cad-documents/review-link-token';
import { IdentityModule } from '../identity/identity.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { CadModule } from './cad.module';
import { CadDemoShareService } from './cad-demo-share.service';

const CAD = {
  meta: { schema: 3, version: 1, unit: 'mm' },
  entities: [
    {
      id: 'line-1',
      type: 'line',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 4_000, y: 0, z: 0 },
      layer: '0',
    },
  ],
  blocks: [],
  constraints: [],
};

describe('Compartir /demo sin cuenta: capacidad acotada', () => {
  jest.setTimeout(30_000);
  let app: NestExpressApplication;
  let database: DataSource;

  beforeAll(async () => {
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
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    app.useBodyParser('json', { limit: '1mb' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    database = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  const publish = (ip: string, document: unknown = CAD) =>
    request(app.getHttpServer())
      .post('/v1/cad/demo-shares')
      .set('X-Forwarded-For', ip)
      .send({ document });

  it('emite token server-owned, sólo hash en DB y abre el plano sin login', async () => {
    const created = await publish('198.51.100.11').expect(201);
    expect(created.headers['cache-control']).toBe('private, no-store');
    const createdBody = created.body as {
      shareToken: string;
      expiresAt: string;
    };
    const token = createdBody.shareToken;
    expect(token).toMatch(/^vdrl_[A-Za-z0-9_-]{43}$/);
    expect(createdBody.expiresAt).toBeTruthy();
    expect(JSON.stringify(created.body)).not.toContain('tokenHash');

    const session = await database
      .getRepository(CadReviewSession)
      .findOneByOrFail({
        tokenHash: hashReviewLinkToken(token),
      });
    expect(session.allowComments).toBe(false);
    expect(session.expiresAt!.getTime()).toBeGreaterThan(
      Date.now() + 23 * 60 * 60_000,
    );
    expect(session.expiresAt!.getTime()).toBeLessThan(
      Date.now() + 25 * 60 * 60_000,
    );
    const document = await database
      .getRepository(CadDocument)
      .findOneByOrFail({ id: session.documentId });
    expect(document.cadDocument?.entities).toHaveLength(1);
    expect(document.tenant_id).toBe(session.tenant_id);
    expect(JSON.stringify(document)).not.toContain(token);

    const guest = await request(app.getHttpServer())
      .get('/v1/cad/review/context')
      .set('X-Review-Token', token)
      .expect(200);
    expect(guest.headers['cache-control']).toBe('private, no-store');
    const guestBody = guest.body as {
      readOnly: boolean;
      document: { id: string; cadDocument: { entities: unknown[] } };
    };
    expect(guestBody.readOnly).toBe(true);
    expect(guestBody.document.id).toBe(session.documentId);
    expect(guestBody.document.cadDocument.entities).toHaveLength(1);

    const other = await publish('198.51.100.15').expect(201);
    const otherBody = other.body as { shareToken: string };
    const otherSession = await database
      .getRepository(CadReviewSession)
      .findOneByOrFail({
        tokenHash: hashReviewLinkToken(otherBody.shareToken),
      });
    expect(otherSession.documentId).not.toBe(session.documentId);
    await request(app.getHttpServer())
      .get(`/v1/cad/documents/${otherSession.documentId}`)
      .set('X-Review-Token', token)
      .expect(403);

    const foreign = await database.getRepository(CadDocument).save({
      tenant_id: 'ea5c7f67-0632-47bd-b941-e89c72e0f094',
      organization_id: null,
      plant_id: null,
      created_by: 'otro-tenant',
      projectId: null,
      name: 'Secreto de otra organización',
      model: 'foreign-test',
      revision: 'v1',
      cadDocument: {
        ...CAD,
        entities: [{ ...CAD.entities[0], id: 'secreto-otro-tenant' }],
      },
      cadDocumentVersion: 1,
      layers: null,
    });
    const attemptedForeignContext = await request(app.getHttpServer())
      .get(`/v1/cad/review/context?documentId=${foreign.id}`)
      .set('X-Review-Token', token)
      .expect(200);
    expect(JSON.stringify(attemptedForeignContext.body)).not.toContain(
      'secreto-otro-tenant',
    );
    const attemptedForeignBody = attemptedForeignContext.body as {
      document: { id: string };
    };
    expect(attemptedForeignBody.document.id).toBe(session.documentId);
    await request(app.getHttpServer())
      .get(`/v1/cad/documents/${foreign.id}`)
      .set('X-Review-Token', token)
      .expect(403);

    await request(app.getHttpServer())
      .post('/v1/cad/review/comments')
      .set('X-Review-Token', token)
      .send({ body: 'No permitido' })
      .expect(403);
    await request(app.getHttpServer())
      .put(`/v1/cad/documents/${session.documentId}/content`)
      .set('X-Review-Token', token)
      .send({ cadDocument: CAD, expectedCadDocumentVersion: 1 })
      .expect(403);
  });

  it('rechaza documentos grandes y limita intentos anónimos por IP', async () => {
    const before = await database.getRepository(CadDocument).count();
    await publish('198.51.100.12', {
      ...CAD,
      text: 'x'.repeat(270_000),
    }).expect(413);
    expect(await database.getRepository(CadDocument).count()).toBe(before);
    await publish('198.51.100.13').expect(201);
    await publish('198.51.100.13').expect(201);
    await publish('198.51.100.13').expect(429);
  });

  it('vencimiento y purga invalidan el enlace y retiran el snapshot', async () => {
    const created = await publish('198.51.100.14').expect(201);
    const token = (created.body as { shareToken: string }).shareToken;
    const repository = database.getRepository(CadReviewSession);
    const session = await repository.findOneByOrFail({
      tokenHash: hashReviewLinkToken(token),
    });
    session.expiresAt = new Date(Date.now() - 1_000);
    await repository.save(session);
    await request(app.getHttpServer())
      .get('/v1/cad/review/context')
      .set('X-Review-Token', token)
      .expect(401);
    expect(await app.get(CadDemoShareService).purgeExpired()).toBeGreaterThan(
      0,
    );
    expect(
      await database
        .getRepository(CadReviewSession)
        .findOneBy({ id: session.id }),
    ).toBeNull();
    expect(
      await database
        .getRepository(CadDocument)
        .findOneBy({ id: session.documentId }),
    ).toBeNull();
  });
});
