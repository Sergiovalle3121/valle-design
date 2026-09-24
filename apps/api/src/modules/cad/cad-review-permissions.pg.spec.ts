import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { TenantModule } from '../../common/tenant/tenant.module';
import {
  FIRST_PARTY_AUTH_ENTITY_GRAPH,
  seedFirstPartyCadActor,
} from '../../common/testing/first-party-cad-auth';
import {
  describePostgres,
  postgresTestUrl,
} from '../../common/testing/postgres-harness';
import { ReviewCommentsOptIn20260923190000 } from '../../migrations/20260923190000-ReviewCommentsOptIn';
import { CadAuthGuard } from '../auth/guards/cad-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { BlobStoreModule } from '../blob-store/blob-store.module';
import { CadDocumentsModule } from '../cad-documents/cad-documents.module';
import { IdentityModule } from '../identity/identity.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { CadModule } from './cad.module';

describePostgres(
  'F3: permisos de comentarios tras migración PostgreSQL',
  () => {
    jest.setTimeout(120_000);

    let app: NestExpressApplication;
    let schema: string;

    beforeAll(async () => {
      const url = postgresTestUrl()!;
      schema = `review_perm_${randomBytes(6).toString('hex')}`;
      const bootstrap = new DataSource({ type: 'postgres', url });
      await bootstrap.initialize();
      await bootstrap.query(`CREATE SCHEMA "${schema}"`);
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
      await app.init();
    });

    afterAll(async () => {
      if (app) await app.close();
      if (!schema) return;
      const cleanup = new DataSource({
        type: 'postgres',
        url: postgresTestUrl()!,
      });
      await cleanup.initialize();
      await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await cleanup.destroy();
    });

    it('cambia el default real, crea sesión sin permiso y reserva resolver al autor', async () => {
      const dataSource = app.get(DataSource);
      const author = await seedFirstPartyCadActor(dataSource, {
        email: 'f3-postgres@author.test.invalid',
        role: 'owner',
      });
      const server = app.getHttpServer();
      const document = await request(server)
        .post('/v1/cad/documents')
        .set(author.headers)
        .send({ name: 'Plano para prueba F3 PostgreSQL' })
        .expect(201);

      // Emula el default de la base anterior y un enlace autorizado ya emitido.
      await dataSource.query(
        `ALTER TABLE "${schema}"."cad_review_sessions" ALTER COLUMN "allow_comments" SET DEFAULT true`,
      );
      const existingSessionId = randomUUID();
      await dataSource.query(
        `INSERT INTO "${schema}"."cad_review_sessions"
       ("id", "document_id", "tenant_id", "organization_id", "allow_comments")
       VALUES ($1, $2, $3, $3, true)`,
        [existingSessionId, document.body.id, author.organizationId],
      );
      // Ejecuta la migración real, con search_path acotado al esquema de esta suite.
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        await runner.query(`SET search_path TO "${schema}"`);
        await new ReviewCommentsOptIn20260923190000().up(runner);
      } finally {
        await runner.release();
      }
      const [column] = await dataSource.query(
        `SELECT column_default FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'cad_review_sessions'
         AND column_name = 'allow_comments'`,
        [schema],
      );
      expect(column.column_default).toBe('false');
      const [existingSession] = await dataSource.query(
        `SELECT "allow_comments" FROM "${schema}"."cad_review_sessions" WHERE "id" = $1`,
        [existingSessionId],
      );
      expect(existingSession.allow_comments).toBe(true);

      // La inserción SQL omite por completo allow_comments: prueba el default de PG.
      const [databaseSession] = await dataSource.query(
        `INSERT INTO "${schema}"."cad_review_sessions"
       ("id", "document_id", "tenant_id", "organization_id")
       VALUES ($1, $2, $3, $3) RETURNING "allow_comments"`,
        [randomUUID(), document.body.id, author.organizationId],
      );
      expect(databaseSession.allow_comments).toBe(false);

      // La API también omite el campo: el invitado recibe sólo lectura.
      const viewOnly = await request(server)
        .post(`/v1/cad/documents/${document.body.id}/review-sessions`)
        .set(author.headers)
        .send({ shareLink: true })
        .expect(201);
      expect(viewOnly.body.session.allowComments).toBe(false);
      const deniedComment = await request(server)
        .post('/v1/cad/review/comments')
        .set('X-Review-Token', viewOnly.body.shareToken)
        .send({ body: 'No autorizado' })
        .expect(403);
      expect(deniedComment.body.code).toBe('review_comments_disabled');

      // Sólo el opt-in expreso permite comentar; ni así permite resolver al invitado.
      const optedIn = await request(server)
        .post(`/v1/cad/documents/${document.body.id}/review-sessions`)
        .set(author.headers)
        .send({ shareLink: true, allowComments: true })
        .expect(201);
      const comment = await request(server)
        .post('/v1/cad/review/comments')
        .set('X-Review-Token', optedIn.body.shareToken)
        .send({ body: 'Observación autorizada' })
        .expect(201);
      const deniedResolve = await request(server)
        .post(`/v1/cad/review/comments/${comment.body.id}/resolve`)
        .set('X-Review-Token', optedIn.body.shareToken)
        .expect(403);
      expect(deniedResolve.body.code).toBe('review_read_only');
      await request(server)
        .post(`/v1/cad/comments/${comment.body.id}/resolve`)
        .set(author.headers)
        .expect(201);
    });
  },
);
