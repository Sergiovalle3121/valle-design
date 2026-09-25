import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  DomainOutbox,
  EmailOutbox,
  PlanCatalog,
  PlanEntitlement,
  Subscription,
  UsageLedger,
} from '../commercial/entities/commercial.entities';
import {
  Invitation,
  Membership,
  Organization,
} from '../organizations/entities/organization.entity';
import {
  Credential,
  IdentityAuditEvent,
  OneTimeToken,
  Session,
  User,
} from './entities/identity.entity';
import { IdentityModule } from './identity.module';

/**
 * CON QUÉ DESPACHO NACE UNA SESIÓN.
 *
 * Toda sesión nacía sin despacho activo y sólo el tablero lo activaba: quien
 * volvía a entrar directo a su plano (un marcador, el `returnTo` de una
 * sesión caducada) leía «No tienes permiso suficiente para abrir este
 * documento». Ahora nace con el último despacho que tuvo activo, si sigue
 * siendo miembro, o con el único al que pertenece. Nunca con uno ajeno.
 */

const HARNESS_KEY = 'identity-harness-key-with-at-least-32-chars';
const EMAIL = 'despacho.activo@example.test';
const PASSWORD = 'Despacho-activo-2026!';

/** SQLite guarda `createdAt` al segundo: el orden entre sesiones necesita cruzar uno. */
async function crossSecondBoundary(): Promise<void> {
  await new Promise((resolve) =>
    setTimeout(resolve, 1_010 - (Date.now() % 1_000)),
  );
}

interface SessionBody {
  organization: { id: string } | null;
}

describe('el despacho con el que nace una sesión', () => {
  jest.setTimeout(30_000);

  let app: NestExpressApplication;
  let dataSource: DataSource;
  let userId: string;
  const originalHarness = process.env.IDENTITY_TEST_HARNESS;
  const originalHarnessKey = process.env.IDENTITY_TEST_HARNESS_KEY;

  async function login(): Promise<{
    agent: ReturnType<typeof request.agent>;
    organizationId: string | null;
  }> {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    const session = await agent.get('/v1/auth/session').expect(200);
    return {
      agent,
      organizationId: (session.body as SessionBody).organization?.id ?? null,
    };
  }

  async function addOrganization(name: string): Promise<string> {
    const organization = await dataSource.getRepository(Organization).save({
      name,
      slug: name.toLowerCase().replace(/\s+/gu, '-'),
      ownerUserId: userId,
    });
    await dataSource
      .getRepository(Membership)
      .save({ organizationId: organization.id, userId, role: 'owner' });
    return organization.id;
  }

  beforeAll(async () => {
    process.env.IDENTITY_TEST_HARNESS = 'true';
    process.env.IDENTITY_TEST_HARNESS_KEY = HARNESS_KEY;
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          dropSchema: true,
          synchronize: true,
          autoLoadEntities: true,
          entities: [
            User,
            Credential,
            Session,
            OneTimeToken,
            IdentityAuditEvent,
            Organization,
            Membership,
            Invitation,
            PlanCatalog,
            PlanEntitlement,
            Subscription,
            UsageLedger,
            DomainOutbox,
            EmailOutbox,
          ],
        }),
        IdentityModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    dataSource = app.get(DataSource);

    const server = app.getHttpServer();
    await request(server)
      .post('/v1/auth/register')
      .send({ email: EMAIL, password: PASSWORD, displayName: 'Despacho' })
      .expect(202);
    const mail = await request(server)
      .get('/_development/email-outbox')
      .set('x-valle-test-harness', HARNESS_KEY)
      .query({ recipient: EMAIL })
      .expect(200);
    await request(server)
      .post('/v1/auth/verify-email')
      .send({
        token: (mail.body as { payload: { token: string } }).payload.token,
      })
      .expect(201);
    userId = (
      await dataSource.getRepository(User).findOneByOrFail({ email: EMAIL })
    ).id;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (originalHarness === undefined) delete process.env.IDENTITY_TEST_HARNESS;
    else process.env.IDENTITY_TEST_HARNESS = originalHarness;
    if (originalHarnessKey === undefined)
      delete process.env.IDENTITY_TEST_HARNESS_KEY;
    else process.env.IDENTITY_TEST_HARNESS_KEY = originalHarnessKey;
  });

  it('sin despacho, la sesión nace sin despacho', async () => {
    expect((await login()).organizationId).toBeNull();
  });

  it('con un solo despacho, la sesión nace con él', async () => {
    const only = await addOrganization('Estudio Uno');
    expect((await login()).organizationId).toBe(only);
  });

  it('con varios, nace con el último que tuvo activo; si deja de ser miembro, no', async () => {
    const [first] = await dataSource
      .getRepository(Membership)
      .findBy({ userId });
    const second = await addOrganization('Estudio Dos');

    // Con dos despachos y el último activo en el primero, se queda en el primero.
    expect((await login()).organizationId).toBe(first.organizationId);

    // Quien cambia al segundo en el tablero vuelve a entrar en el segundo.
    await crossSecondBoundary();
    const { agent } = await login();
    const session = await agent.get('/v1/auth/session').expect(200);
    await dataSource
      .getRepository(Session)
      .update(
        { id: (session.body as { session: { id: string } }).session.id },
        { activeOrganizationId: second },
      );
    await crossSecondBoundary();
    expect((await login()).organizationId).toBe(second);

    // Si lo sacan del segundo, la sesión nueva NO lo abre: queda el único
    // despacho del que sí es miembro.
    await dataSource
      .getRepository(Membership)
      .delete({ userId, organizationId: second });
    await crossSecondBoundary();
    expect((await login()).organizationId).toBe(first.organizationId);
  });
});
