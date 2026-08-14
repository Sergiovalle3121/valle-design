import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import {
  FIRST_PARTY_AUTH_ENTITY_GRAPH,
  seedFirstPartyCadActor,
  type FirstPartyCadActor,
} from '../../common/testing/first-party-cad-auth';
import { TenantModule } from '../../common/tenant/tenant.module';
import { CommercialMetricsController } from '../../health/commercial-metrics.controller';
import { CadAuthGuard } from '../auth/guards/cad-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { BlobStoreModule } from '../blob-store/blob-store.module';
import { CadDocumentsModule } from '../cad-documents/cad-documents.module';
import { CommercialTelemetryService } from '../commercial/commercial-telemetry.service';
import {
  DomainOutbox,
  UsageLedger,
} from '../commercial/entities/commercial.entities';
import {
  COMMERCIAL_OUTBOX_OBSERVER,
  CommercialOutboxDispatcher,
} from '../commercial/outbox-dispatcher.service';
import { IdentityModule } from '../identity/identity.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { CadDocumentsRepository } from './cad-documents.repository';
import { CadModule } from './cad.module';

/**
 * Regresión del CABLEADO comercial del CAD, sobre el grafo de módulos real.
 *
 * CadDocumentsRepository inyecta USAGE_METER y CAD_EVENT_PUBLISHER como
 * `@Optional()`: si la cadena de módulos deja de reexportar CommercialModule,
 * la aplicación arranca igual y cada guardado deja SILENCIOSAMENTE de medir
 * uso y de publicar eventos de dominio — ningún otro test lo notaría, porque
 * las suites Postgres construyen el repositorio a mano. Lo mismo aplica al
 * observer del outbox: sin el binding, la telemetría del runbook queda muda.
 * Este spec fija ambos cableados con el resultado observable, no con mocks.
 */
describe('Cableado comercial del CAD (grafo de módulos real)', () => {
  jest.setTimeout(30_000);

  let app: NestExpressApplication;
  let owner: FirstPartyCadActor;

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
      controllers: [CommercialMetricsController],
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
    owner = await seedFirstPartyCadActor(app.get(DataSource), {
      email: 'commercial-wiring@test.invalid',
      role: 'owner',
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('el repositorio CAD recibe medidor de uso y publicador de eventos', () => {
    const resolved: unknown = app.get(CadDocumentsRepository);
    const repository = resolved as {
      usage?: unknown;
      events?: unknown;
      dataSource?: unknown;
    };
    expect(repository.usage).toBeDefined();
    expect(repository.events).toBeDefined();
    expect(repository.dataSource).toBeDefined();
  });

  it('el dispatcher del outbox recibe el observer de telemetría', () => {
    const resolved: unknown = app.get(CommercialOutboxDispatcher);
    const dispatcher = resolved as { observer?: unknown };
    expect(dispatcher.observer).toBe(app.get(COMMERCIAL_OUTBOX_OBSERVER));
    expect(dispatcher.observer).toBe(app.get(CommercialTelemetryService));
  });

  it('un guardado real registra uso idempotente y encola el evento de dominio', async () => {
    const server = app.getHttpServer();
    const document = await request(server)
      .post('/v1/cad/documents')
      .set(owner.headers)
      .send({ name: 'Medición de uso' })
      .expect(201);
    const documentId = (document.body as { id: string }).id;

    const cadDocument = {
      meta: { schema: 3, version: 1, unit: 'mm' },
      entities: [
        {
          id: 'line-1',
          type: 'line',
          start: { x: 0, y: 0 },
          end: { x: 500, y: 0 },
          layer: '0',
        },
      ],
    };
    await request(server)
      .put(`/v1/cad/documents/${documentId}/content`)
      .set(owner.headers)
      .send({ cadDocument, expectedCadDocumentVersion: 0 })
      .expect(200);

    const dataSource = app.get(DataSource);
    const usage = await dataSource.getRepository(UsageLedger).find();
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({
      organizationId: owner.organizationId,
      tenantId: owner.organizationId,
      metric: 'design.document.saved',
      quantity: 1,
      idempotencyKey: `cad-document:${documentId}:version:1`,
    });
    const events = await dataSource.getRepository(DomainOutbox).find();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'design.document.saved',
      aggregateId: documentId,
      status: 'pending',
    });

    // El endpoint de métricas del runbook ve ese backlog sin exponer PII.
    const metrics = await request(server)
      .get('/health/metrics/commercial')
      .expect(200);
    expect(metrics.body.outbox.domain.byStatus).toEqual({ pending: 1 });
    const serialized = JSON.stringify(metrics.body);
    expect(serialized).not.toContain(owner.organizationId!);
    expect(serialized).not.toContain('@test.invalid');
  });
});
