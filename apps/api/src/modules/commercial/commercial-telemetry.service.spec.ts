import { EventEmitter } from 'node:events';
import { DataSource } from 'typeorm';
import type { NextFunction, Request, Response } from 'express';
import { HttpStatusTelemetryMiddleware } from '../../common/telemetry/http-status-telemetry.middleware';
import { User } from '../identity/entities/identity.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { CommercialTelemetryService } from './commercial-telemetry.service';
import { DomainOutbox, EmailOutbox } from './entities/commercial.entities';

describe('CommercialTelemetryService', () => {
  let database: DataSource;
  let service: CommercialTelemetryService;

  beforeEach(async () => {
    database = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [User, Organization, DomainOutbox, EmailOutbox],
      synchronize: true,
    });
    await database.initialize();
    service = new CommercialTelemetryService(
      database.getRepository(DomainOutbox),
      database.getRepository(EmailOutbox),
    );
  });

  afterEach(async () => {
    if (database.isInitialized) await database.destroy();
    jest.restoreAllMocks();
  });

  it('cuenta el ciclo del dispatcher y mide la latencia claimed→sent', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000);
    service.observe({
      event: 'claimed',
      queue: 'email',
      outboxId: 'outbox-1',
      attemptCount: 1,
    });
    now.mockReturnValue(1_450);
    service.observe({
      event: 'sent',
      queue: 'email',
      outboxId: 'outbox-1',
      attemptCount: 1,
    });
    service.observe({
      event: 'retry_scheduled',
      queue: 'domain',
      outboxId: 'outbox-2',
      attemptCount: 2,
      delayMs: 2_000,
      failureKind: 'OutboxWebhookDeliveryError',
    });
    service.observe({
      event: 'dead',
      queue: 'domain',
      outboxId: 'outbox-3',
      attemptCount: 8,
      failureKind: 'OutboxWebhookDeliveryError',
    });
    service.observe({
      event: 'lease_lost',
      queue: 'domain',
      outboxId: 'outbox-4',
      attemptCount: 1,
    });

    const snapshot = await service.snapshot();
    expect(snapshot.dispatcher.email).toMatchObject({
      claimed: 1,
      sent: 1,
      delivery: { count: 1, totalMs: 450, maxMs: 450, lastMs: 450 },
    });
    expect(snapshot.dispatcher.domain).toMatchObject({
      retries: 1,
      dead: 1,
      leaseLost: 1,
      retriesByKind: { OutboxWebhookDeliveryError: 1 },
      deadByKind: { OutboxWebhookDeliveryError: 1 },
    });
  });

  it('un sent sin claimed observado no inventa latencia', async () => {
    service.observe({
      event: 'sent',
      queue: 'domain',
      outboxId: 'outbox-desconocido',
      attemptCount: 3,
    });
    const snapshot = await service.snapshot();
    expect(snapshot.dispatcher.domain.sent).toBe(1);
    expect(snapshot.dispatcher.domain.delivery.count).toBe(0);
  });

  it('cuenta sólo 401/403/409/429 por patrón de ruta y acota cardinalidad', async () => {
    service.recordHttpStatus(401, 'get', '/v1/cad/projects');
    service.recordHttpStatus(401, 'GET', '/v1/cad/projects');
    service.recordHttpStatus(
      403,
      'POST',
      '/v1/cad/documents/:documentId/content',
    );
    service.recordHttpStatus(200, 'GET', '/v1/cad/projects');
    service.recordHttpStatus(500, 'GET', '/v1/cad/projects');
    for (let index = 0; index < 250; index += 1) {
      service.recordHttpStatus(429, 'POST', `/v1/ruta-${index}`);
    }

    const snapshot = await service.snapshot();
    expect(snapshot.http['401']).toEqual({ 'GET /v1/cad/projects': 2 });
    expect(snapshot.http['403']).toEqual({
      'POST /v1/cad/documents/:documentId/content': 1,
    });
    expect(snapshot.http['200']).toBeUndefined();
    expect(snapshot.http['500']).toBeUndefined();
    const buckets429 = snapshot.http['429'];
    expect(Object.keys(buckets429)).toHaveLength(201);
    expect(buckets429['(desbordado)']).toBe(50);
  });

  it('la foto del backlog agrega por estado y calcula la edad sin leer payloads', async () => {
    const users = database.getRepository(User);
    const owner = await users.save({
      email: 'telemetry@example.test',
      displayName: 'Telemetry owner',
      emailVerifiedAt: new Date(),
    });
    const organization = await database.getRepository(Organization).save({
      name: 'Telemetry organization',
      slug: 'telemetry-organization',
      ownerUserId: owner.id,
    });
    const domains = database.getRepository(DomainOutbox);
    const base = {
      organizationId: organization.id,
      tenantId: organization.id,
      type: 'design.document.saved',
      aggregateId: 'doc-1',
      payload: { never: 'leído por la telemetría' },
      payloadHash: 'a'.repeat(64),
      attemptCount: 0,
      availableAt: new Date(),
      lockedAt: null,
      lockOwner: null,
      lastError: null,
      sentAt: null,
      failedAt: null,
    };
    await domains.save([
      domains.create({ ...base, idempotencyKey: 'k1', status: 'pending' }),
      domains.create({ ...base, idempotencyKey: 'k2', status: 'pending' }),
      domains.create({ ...base, idempotencyKey: 'k3', status: 'dead' }),
      domains.create({ ...base, idempotencyKey: 'k4', status: 'sent' }),
    ]);
    // Envejece la fila pendiente más antigua para que la edad sea observable
    // (SQL crudo: TypeORM no reescribe una CreateDateColumn vía update()).
    await database.query(
      `UPDATE "domain_outbox"
          SET "created_at" = datetime('now', '-120 seconds')
        WHERE "idempotency_key" = 'k1'`,
    );

    const snapshot = await service.snapshot();
    expect(snapshot.outbox.domain.byStatus).toEqual({
      pending: 2,
      dead: 1,
      sent: 1,
    });
    expect(
      snapshot.outbox.domain.oldestUnsentAgeSeconds,
    ).toBeGreaterThanOrEqual(115);
    expect(snapshot.outbox.email).toEqual({
      byStatus: {},
      oldestUnsentAgeSeconds: null,
    });
  });
});

describe('HttpStatusTelemetryMiddleware', () => {
  it('reporta el patrón de ruta al terminar y descarta peticiones sin ruta', () => {
    const recorded: Array<[number, string, string]> = [];
    const telemetry = {
      recordHttpStatus: (status: number, method: string, route: string) =>
        recorded.push([status, method, route]),
    } as unknown as CommercialTelemetryService;
    const middleware = new HttpStatusTelemetryMiddleware(telemetry);

    const respond = (route: string | undefined, statusCode: number) => {
      const request = {
        method: 'POST',
        route: route ? { path: route } : undefined,
      };
      const response = new EventEmitter() as unknown as Response;
      (response as { statusCode: number }).statusCode = statusCode;
      const next = jest.fn() as unknown as NextFunction;
      middleware.use(request as unknown as Request, response, next);
      expect(next).toHaveBeenCalledTimes(1);
      (response as unknown as EventEmitter).emit('finish');
    };

    respond('/v1/commercial/upgrade-intents/:intentId/confirm', 403);
    respond(undefined, 404);

    expect(recorded).toEqual([
      [403, 'POST', '/v1/commercial/upgrade-intents/:intentId/confirm'],
    ]);
  });
});
