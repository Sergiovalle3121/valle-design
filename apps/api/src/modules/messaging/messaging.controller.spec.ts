import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import {
  FIRST_PARTY_AUTH_ENTITY_GRAPH,
  type FirstPartyCadActor,
  seedFirstPartyCadActor,
} from '../../common/testing/first-party-cad-auth';
import { TenantModule } from '../../common/tenant/tenant.module';
import { CadAuthGuard } from '../auth/guards/cad-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { BlobStoreModule } from '../blob-store/blob-store.module';
import { CadDocumentsModule } from '../cad-documents/cad-documents.module';
import { CadProject } from '../cad-documents/entities/cad-project.entity';
import { IdentityModule } from '../identity/identity.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { MessagingMessage } from './entities/messaging-message.entity';
import { MessagingModule } from './messaging.module';

/**
 * `/v1/messaging/*` con el stack REAL: guards globales (entitlement + RBAC
 * `cad:*`), TenantInterceptor, pipes y SQLite en memoria — mismo patrón que
 * `cad-review.controller.spec.ts`. Cubre el mandato completo: canal de
 * proyecto visible a toda la organización, canal directo con lista de
 * control de acceso real, mensajes anclados al dibujo, paginación por
 * cursor y no leídos.
 */
describe('Messaging (/v1/messaging, stack completo)', () => {
  jest.setTimeout(30_000);

  let app: NestExpressApplication;
  let dataSource: DataSource;
  let owner: FirstPartyCadActor;
  let teammate: FirstPartyCadActor;
  let outsider: FirstPartyCadActor;
  let viewer: FirstPartyCadActor;

  const createProject = async (name = 'Casa Habitación') => {
    const project = await dataSource.getRepository(CadProject).save({
      name,
      tenant_id: owner.organizationId,
      organization_id: owner.organizationId,
    });
    return project.id;
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
          entities: [...FIRST_PARTY_AUTH_ENTITY_GRAPH],
        }),
        TenantModule,
        IdentityModule,
        OrganizationsModule,
        BlobStoreModule,
        CadDocumentsModule,
        MessagingModule,
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
    dataSource = app.get(DataSource);

    owner = await seedFirstPartyCadActor(dataSource, {
      email: 'duena@test',
      role: 'owner',
    });
    teammate = await seedFirstPartyCadActor(dataSource, {
      email: 'companera@test',
      organizationId: owner.organizationId!,
      role: 'member',
    });
    viewer = await seedFirstPartyCadActor(dataSource, {
      email: 'visor@test',
      organizationId: owner.organizationId!,
      role: 'viewer',
    });
    outsider = await seedFirstPartyCadActor(dataSource, {
      email: 'externo@test',
      role: 'owner',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('canal de proyecto: visible a toda la organización sin invitación explícita', async () => {
    const server = app.getHttpServer();
    const projectId = await createProject();

    const created = await request(server)
      .post('/v1/messaging/channels')
      .set(owner.headers)
      .send({ kind: 'project', projectId, name: 'General' })
      .expect(201);
    expect(created.body).toMatchObject({
      kind: 'project',
      projectId,
      name: 'General',
      unreadCount: 0,
    });
    const channelId = created.body.id as string;

    // La compañera nunca fue "invitada" a este canal — lo ve porque es de
    // la organización dueña del proyecto.
    const listedByTeammate = await request(server)
      .get('/v1/messaging/channels')
      .set(teammate.headers)
      .expect(200);
    expect(
      listedByTeammate.body.items.map((c: { id: string }) => c.id),
    ).toContain(channelId);

    // Alguien de OTRA organización no lo ve en absoluto.
    const listedByOutsider = await request(server)
      .get('/v1/messaging/channels')
      .set(outsider.headers)
      .expect(200);
    expect(
      listedByOutsider.body.items.map((c: { id: string }) => c.id),
    ).not.toContain(channelId);
  });

  it('mensajes con ancla al dibujo, hilo y no leídos que bajan al marcar leído', async () => {
    const server = app.getHttpServer();
    const projectId = await createProject('Consultorio');
    const channel = await request(server)
      .post('/v1/messaging/channels')
      .set(owner.headers)
      .send({ kind: 'project', projectId, name: 'Plantas' })
      .expect(201);
    const channelId = channel.body.id as string;

    const root = await request(server)
      .post(`/v1/messaging/channels/${channelId}/messages`)
      .set(owner.headers)
      .send({
        body: 'Revisen este muro',
        anchor: {
          kind: 'point',
          version: 1,
          space: 'model',
          x: 12.5,
          y: 4,
          entityId: 'wall-1',
        },
      })
      .expect(201);
    expect(root.body).toMatchObject({
      channelId,
      body: 'Revisen este muro',
      parentMessageId: null,
      anchor: { kind: 'point', space: 'model', x: 12.5, y: 4 },
    });
    expect(root.body.author.email).toBe('duena@test');

    const reply = await request(server)
      .post(`/v1/messaging/channels/${channelId}/messages`)
      .set(teammate.headers)
      .send({ body: 'Ya lo veo', parentMessageId: root.body.id })
      .expect(201);
    expect(reply.body.parentMessageId).toBe(root.body.id);

    // La dueña no leyó nada de esto: cuenta los dos mensajes que NO son suyos... salvo
    // que uno de los dos SÍ es suyo (el raíz) — sólo el de la compañera cuenta.
    const listed = await request(server)
      .get('/v1/messaging/channels')
      .set(owner.headers)
      .expect(200);
    const view = listed.body.items.find(
      (c: { id: string }) => c.id === channelId,
    );
    expect(view.unreadCount).toBe(1);

    await request(server)
      .post(`/v1/messaging/channels/${channelId}/read`)
      .set(owner.headers)
      .expect(201);

    const afterRead = await request(server)
      .get('/v1/messaging/channels')
      .set(owner.headers)
      .expect(200);
    const viewAfter = afterRead.body.items.find(
      (c: { id: string }) => c.id === channelId,
    );
    expect(viewAfter.unreadCount).toBe(0);
  });

  it('paginación por cursor: llegan en orden y el cursor trae la página anterior', async () => {
    const server = app.getHttpServer();
    const projectId = await createProject('Taquería');
    const channel = await request(server)
      .post('/v1/messaging/channels')
      .set(owner.headers)
      .send({ kind: 'project', projectId, name: 'Obra' })
      .expect(201);
    const channelId = channel.body.id as string;

    // Sembrado DIRECTO con `created_at` explícito y separado un segundo cada
    // uno: peticiones HTTP consecutivas en un SQLite en memoria pueden caer
    // en el MISMO milisegundo (el runtime es más rápido que la resolución
    // del reloj), y esta prueba necesita orden determinista para verificar el
    // cursor — no la ruta de creación, que ya cubre otra prueba.
    const messages = dataSource.getRepository(MessagingMessage);
    for (let i = 0; i < 5; i += 1) {
      const row = messages.create({
        tenant_id: owner.organizationId,
        organization_id: owner.organizationId,
        channelId,
        authorUserId: owner.userId,
        body: `mensaje ${i}`,
        parentMessageId: null,
        anchor: null,
      });
      await messages.save(row);
      await messages.update(row.id, {
        created_at: new Date(Date.UTC(2026, 7, 31, 12, 0, i)),
      });
    }

    const firstPage = await request(server)
      .get(`/v1/messaging/channels/${channelId}/messages`)
      .set(owner.headers)
      .query({ limit: 2 })
      .expect(200);
    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.items.map((m: { body: string }) => m.body)).toEqual([
      'mensaje 3',
      'mensaje 4',
    ]);
    expect(firstPage.body.nextCursor).toBeTruthy();

    const secondPage = await request(server)
      .get(`/v1/messaging/channels/${channelId}/messages`)
      .set(owner.headers)
      .query({ limit: 2, cursor: firstPage.body.nextCursor })
      .expect(200);
    expect(secondPage.body.items.map((m: { body: string }) => m.body)).toEqual([
      'mensaje 1',
      'mensaje 2',
    ]);
  });

  it('canal directo: idempotente, sólo lo ven sus dos personas y no acepta abrirse con uno mismo', async () => {
    const server = app.getHttpServer();

    const first = await request(server)
      .post('/v1/messaging/channels')
      .set(owner.headers)
      .send({ kind: 'direct', memberUserId: teammate.userId })
      .expect(201);
    expect(first.body.kind).toBe('direct');
    expect(first.body.otherMember).toMatchObject({ email: 'companera@test' });

    // Pedirlo otra vez (en cualquier orden) devuelve el MISMO canal.
    const again = await request(server)
      .post('/v1/messaging/channels')
      .set(teammate.headers)
      .send({ kind: 'direct', memberUserId: owner.userId })
      .expect(201);
    expect(again.body.id).toBe(first.body.id);

    await request(server)
      .post('/v1/messaging/channels')
      .set(owner.headers)
      .send({ kind: 'direct', memberUserId: owner.userId })
      .expect(400);

    // Un tercero de la MISMA organización no puede leer ni escribir ahí.
    await request(server)
      .get(`/v1/messaging/channels/${first.body.id}/messages`)
      .set(viewer.headers)
      .expect(403);
    await request(server)
      .post(`/v1/messaging/channels/${first.body.id}/messages`)
      .set(viewer.headers)
      .send({ body: 'no debería poder' })
      .expect(403);

    // Y no aparece en su lista de canales.
    const viewerChannels = await request(server)
      .get('/v1/messaging/channels')
      .set(viewer.headers)
      .expect(200);
    expect(
      viewerChannels.body.items.map((c: { id: string }) => c.id),
    ).not.toContain(first.body.id);
  });

  it('viewer: lee pero no escribe (RBAC cad:view/cad:edit reutilizado)', async () => {
    const server = app.getHttpServer();
    const projectId = await createProject('Nave industrial');
    const channel = await request(server)
      .post('/v1/messaging/channels')
      .set(owner.headers)
      .send({ kind: 'project', projectId, name: 'Coordinación' })
      .expect(201);
    const channelId = channel.body.id as string;

    await request(server)
      .get(`/v1/messaging/channels/${channelId}/messages`)
      .set(viewer.headers)
      .expect(200);
    await request(server)
      .post(`/v1/messaging/channels/${channelId}/messages`)
      .set(viewer.headers)
      .send({ body: 'intento de escribir' })
      .expect(403);
  });

  it('un mensaje vacío tras trim es 400', async () => {
    const server = app.getHttpServer();
    const projectId = await createProject('Bodega');
    const channel = await request(server)
      .post('/v1/messaging/channels')
      .set(owner.headers)
      .send({ kind: 'project', projectId, name: 'x' })
      .expect(201);

    await request(server)
      .post(`/v1/messaging/channels/${channel.body.id}/messages`)
      .set(owner.headers)
      .send({ body: '   ' })
      .expect(400);
  });
});
