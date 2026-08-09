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
import { AuditLogModule } from '../audit-log/audit-log.module';
import { BlobStoreModule } from '../blob-store/blob-store.module';
import { CadDocumentsModule } from '../cad-documents/cad-documents.module';
import { IdentityModule } from '../identity/identity.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { CadModule } from './cad.module';

/**
 * Conjuntos de planos (`/v1/cad/sheet-sets`) con el stack REAL: guards
 * globales, TenantInterceptor, pipes y SQLite en memoria.
 *
 * Lo que de verdad hay que demostrar aquí son dos cosas:
 *
 * 1. **El CAS funciona.** Un guardado con la versión vieja se responde con 409
 *    y NO sobrescribe. Reordenar un conjunto reescribe el número de casi todas
 *    sus hojas, así que dos guardados concurrentes sin CAS no pierden un campo:
 *    pierden la numeración entera de una de las dos personas.
 * 2. **El aislamiento por tenant.** Un conjunto de otra organización no se ve
 *    ni se puede leer por id.
 */
describe('CadSheetSet (/v1/cad/sheet-sets, stack completo)', () => {
  jest.setTimeout(30_000);

  let app: NestExpressApplication;
  let dataSource: DataSource;
  let author: FirstPartyCadActor;
  let stranger: FirstPartyCadActor;

  const createDocument = async (name = 'Plano') => {
    const res = await request(app.getHttpServer())
      .post('/v1/cad/documents')
      .set(author.headers)
      .send({ name })
      .expect(201);
    return res.body.id as string;
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
    dataSource = app.get(DataSource);
    author = await seedFirstPartyCadActor(dataSource, {
      email: 'conjuntos@test',
      role: 'owner',
    });
    stranger = await seedFirstPartyCadActor(dataSource, {
      email: 'ajeno@test',
      role: 'owner',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('crea, lee y lista un conjunto vacío con su numeración', async () => {
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/v1/cad/sheet-sets')
      .set(author.headers)
      .send({
        name: 'Nave industrial',
        description: 'Proyecto básico',
        fields: { Proyecto: 'Nave Los Olivos' },
        numbering: {
          prefix: 'A-',
          start: 101,
          step: 1,
          padding: 0,
          suffix: '',
        },
      })
      .expect(201);

    expect(created.body.name).toBe('Nave industrial');
    expect(created.body.version).toBe(1);
    expect(created.body.sheetCount).toBe(0);
    expect(created.body.sheets).toEqual([]);
    expect(created.body.fields).toEqual({ Proyecto: 'Nave Los Olivos' });
    expect(created.body.numbering.start).toBe(101);

    const read = await request(server)
      .get(`/v1/cad/sheet-sets/${created.body.id}`)
      .set(author.headers)
      .expect(200);
    expect(read.body.id).toBe(created.body.id);

    const listed = await request(server)
      .get('/v1/cad/sheet-sets')
      .set(author.headers)
      .expect(200);
    expect(
      listed.body.items.some(
        (item: { id: string }) => item.id === created.body.id,
      ),
    ).toBe(true);
    // La lista NO trae las hojas: es una cabecera.
    expect(listed.body.items[0].sheets).toBeUndefined();
    expect(listed.body.items[0].sheetCount).toBe(0);
  });

  it('guarda las hojas con CAS y rechaza la versión vieja SIN sobrescribir', async () => {
    const server = app.getHttpServer();
    const documentId = await createDocument();
    const created = await request(server)
      .post('/v1/cad/sheet-sets')
      .set(author.headers)
      .send({ name: 'Conjunto CAS' })
      .expect(201);
    const id = created.body.id as string;

    const sheets = [
      {
        id: 's1',
        order: 0,
        documentId,
        layoutId: 'layout:planta',
        title: 'Planta',
        number: 'A-101',
        revision: 'P01',
      },
      {
        id: 's2',
        order: 1,
        documentId,
        layoutId: 'layout:alzado',
        title: 'Alzado',
        number: 'A-102',
        revision: 'P01',
      },
    ];

    const saved = await request(server)
      .put(`/v1/cad/sheet-sets/${id}`)
      .set(author.headers)
      .send({ expectedVersion: 1, sheets })
      .expect(200);
    expect(saved.body.version).toBe(2);
    expect(saved.body.sheetCount).toBe(2);
    expect(
      saved.body.sheets.map((sheet: { number: string }) => sheet.number),
    ).toEqual(['A-101', 'A-102']);

    // El segundo cliente todavía cree tener la 1: se le dice que no, con la
    // versión vigente, y lo guardado no se toca.
    const conflict = await request(server)
      .put(`/v1/cad/sheet-sets/${id}`)
      .set(author.headers)
      .send({ expectedVersion: 1, sheets: [] })
      .expect(409);
    expect(
      conflict.body.currentVersion ?? conflict.body.message?.currentVersion,
    ).toBe(2);

    const after = await request(server)
      .get(`/v1/cad/sheet-sets/${id}`)
      .set(author.headers)
      .expect(200);
    expect(after.body.version).toBe(2);
    expect(after.body.sheets).toHaveLength(2);

    // Con la versión correcta sí entra.
    const renumbered = await request(server)
      .put(`/v1/cad/sheet-sets/${id}`)
      .set(author.headers)
      .send({
        expectedVersion: 2,
        name: 'Conjunto CAS (rev)',
        sheets: [{ ...sheets[1], order: 0, number: 'A-101' }],
      })
      .expect(200);
    expect(renumbered.body.version).toBe(3);
    expect(renumbered.body.name).toBe('Conjunto CAS (rev)');
    expect(renumbered.body.sheets).toHaveLength(1);
  });

  it('valida el cuerpo: campo desconocido y hoja incompleta son 400', async () => {
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/v1/cad/sheet-sets')
      .set(author.headers)
      .send({ name: 'Validación' })
      .expect(201);

    await request(server)
      .post('/v1/cad/sheet-sets')
      .set(author.headers)
      .send({ name: 'X', inventado: true })
      .expect(400);

    await request(server)
      .put(`/v1/cad/sheet-sets/${created.body.id}`)
      .set(author.headers)
      .send({ expectedVersion: 1, sheets: [{ id: 's1' }] })
      .expect(400);

    // `expectedVersion` no es opcional: guardar sin CAS no es una opción.
    await request(server)
      .put(`/v1/cad/sheet-sets/${created.body.id}`)
      .set(author.headers)
      .send({ sheets: [] })
      .expect(400);
  });

  it('aísla por tenant: el conjunto de otra organización no existe', async () => {
    const server = app.getHttpServer();
    const mine = await request(server)
      .post('/v1/cad/sheet-sets')
      .set(author.headers)
      .send({ name: 'Sólo mío' })
      .expect(201);

    const theirList = await request(server)
      .get('/v1/cad/sheet-sets')
      .set(stranger.headers)
      .expect(200);
    expect(
      theirList.body.items.some(
        (item: { id: string }) => item.id === mine.body.id,
      ),
    ).toBe(false);

    await request(server)
      .get(`/v1/cad/sheet-sets/${mine.body.id}`)
      .set(stranger.headers)
      .expect(404);
  });

  it('borra el conjunto y sólo el conjunto', async () => {
    const server = app.getHttpServer();
    const documentId = await createDocument('Plano que sobrevive');
    const created = await request(server)
      .post('/v1/cad/sheet-sets')
      .set(author.headers)
      .send({ name: 'Efímero' })
      .expect(201);
    await request(server)
      .put(`/v1/cad/sheet-sets/${created.body.id}`)
      .set(author.headers)
      .send({
        expectedVersion: 1,
        sheets: [
          {
            id: 's1',
            order: 0,
            documentId,
            layoutId: 'layout:planta',
            title: 'Planta',
            number: 'A-101',
            revision: 'P01',
          },
        ],
      })
      .expect(200);

    await request(server)
      .delete(`/v1/cad/sheet-sets/${created.body.id}`)
      .set(author.headers)
      .expect(204);

    await request(server)
      .get(`/v1/cad/sheet-sets/${created.body.id}`)
      .set(author.headers)
      .expect(404);

    // El dibujo referenciado sigue ahí: un conjunto es una lista de
    // referencias, no el contenido.
    await request(server)
      .get(`/v1/cad/documents/${documentId}`)
      .set(author.headers)
      .expect(200);
  });
});
