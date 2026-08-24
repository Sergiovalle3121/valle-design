import { ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { CadAuthGuard } from '../auth/guards/cad-auth.guard';
import {
  Credential,
  IdentityAuditEvent,
  OneTimeToken,
  Session,
  User,
} from '../identity/entities/identity.entity';
import { IdentityModule } from '../identity/identity.module';
import { CSRF_COOKIE } from '../identity/identity-security';
import {
  Invitation,
  Membership,
  Organization,
} from '../organizations/entities/organization.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import {
  DomainOutbox,
  EmailOutbox,
  Invoice,
  PaymentEvent,
  PlanCatalog,
  PlanEntitlement,
  PlanPrice,
  Subscription,
  SubscriptionUpgradeIntent,
  TaxProfile,
  UsageLedger,
} from './entities/commercial.entities';
import { CfdiReceipt } from './entities/cfdi-receipt.entity';
import { PAYMENT_PROVIDER } from './ports/payment-provider.port';
import type {
  PaymentCancellationResult,
  PaymentCheckoutResult,
  PaymentPortalResult,
  PaymentProvider,
  PaymentProviderDescriptor,
  PaymentWebhookEvent,
} from './ports/payment-provider.port';

/**
 * HTTP end-to-end de P0-A (campaña de seguridad 2026-08-23): un owner/admin
 * de la organización CLIENTE jamás puede confirmar su propio upgrade-intent,
 * pase lo que pase con el estado, con el rol o con el proveedor de pagos
 * activo. Sesión real, cookie de sesión y CSRF reales, PostgreSQL sustituido
 * por SQLite en memoria (mismo patrón que
 * `organizations.integration.spec.ts`: sin `DATABASE_URL`/`DB_HOST` las
 * columnas usan `datetime`/`simple-json`, ver `date-column-type.ts`).
 */
const TEST_HARNESS_KEY = [
  'confirm',
  'harness',
  'fixture',
  'with',
  'sufficient',
  'length',
].join('-');
const PASSWORD = 'Confirm-flow-2026!';

interface LoginContext {
  agent: request.Agent;
  csrf: string;
  userId: string;
}

interface HarnessEmail {
  template: string;
  payload: { token: string };
}

interface UpgradeIntentBody {
  id: string;
  status: string;
}

function responseCookie(response: request.Response, name: string): string {
  const cookies = response.headers['set-cookie'] as unknown;
  if (!Array.isArray(cookies)) {
    throw new Error('Expected first-party response cookies.');
  }
  const prefix = `${name}=`;
  const header = (cookies as string[]).find((entry) =>
    entry.startsWith(prefix),
  );
  if (!header) throw new Error(`Missing ${name} response cookie.`);
  return decodeURIComponent(header.slice(prefix.length).split(';', 1)[0]);
}

/** Descriptor de un proveedor real (Stripe u otro), para el caso adversarial. */
function fakeRealPaymentProvider(): PaymentProvider {
  return {
    descriptor(): PaymentProviderDescriptor {
      return { name: 'stripe', mode: 'hosted', available: true };
    },
    createCheckout(): Promise<PaymentCheckoutResult> {
      return Promise.resolve({
        kind: 'unavailable',
        reason: 'not exercised in this test',
      });
    },
    cancelAtPeriodEnd(): Promise<PaymentCancellationResult> {
      return Promise.resolve({
        kind: 'unavailable',
        reason: 'not exercised in this test',
      });
    },
    createBillingPortalSession(): Promise<PaymentPortalResult> {
      return Promise.resolve({
        kind: 'unavailable',
        reason: 'not exercised in this test',
      });
    },
    verifyWebhook(): Promise<PaymentWebhookEvent> {
      return Promise.reject(new Error('not exercised in this test'));
    },
  };
}

describe('confirmUpgradeIntent HTTP (P0-A): retirado para cualquier principal de la organización cliente', () => {
  jest.setTimeout(45_000);

  let app: NestExpressApplication;
  let dataSource: DataSource;
  const originalHarness = process.env.IDENTITY_TEST_HARNESS;
  const originalHarnessKey = process.env.IDENTITY_TEST_HARNESS_KEY;
  const originalTrialDays = process.env.TRIAL_DAYS;

  async function buildApp(
    paymentProviderOverride?: PaymentProvider,
  ): Promise<NestExpressApplication> {
    const builder = Test.createTestingModule({
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
            PlanPrice,
            Subscription,
            SubscriptionUpgradeIntent,
            UsageLedger,
            DomainOutbox,
            EmailOutbox,
            PaymentEvent,
            Invoice,
            TaxProfile,
            CfdiReceipt,
          ],
        }),
        IdentityModule,
        OrganizationsModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: CadAuthGuard }],
    });
    if (paymentProviderOverride) {
      builder
        .overrideProvider(PAYMENT_PROVIDER)
        .useValue(paymentProviderOverride);
    }
    const moduleRef = await builder.compile();
    const nestApp = moduleRef.createNestApplication<NestExpressApplication>();
    nestApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await nestApp.init();
    return nestApp;
  }

  beforeAll(() => {
    process.env.IDENTITY_TEST_HARNESS = 'true';
    process.env.IDENTITY_TEST_HARNESS_KEY = TEST_HARNESS_KEY;
    process.env.TRIAL_DAYS = '3';
  });

  afterAll(() => {
    if (originalHarness === undefined) delete process.env.IDENTITY_TEST_HARNESS;
    else process.env.IDENTITY_TEST_HARNESS = originalHarness;
    if (originalHarnessKey === undefined)
      delete process.env.IDENTITY_TEST_HARNESS_KEY;
    else process.env.IDENTITY_TEST_HARNESS_KEY = originalHarnessKey;
    if (originalTrialDays === undefined) delete process.env.TRIAL_DAYS;
    else process.env.TRIAL_DAYS = originalTrialDays;
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  async function latestEmail(recipient: string): Promise<HarnessEmail> {
    const response = await request(app.getHttpServer())
      .get('/_development/email-outbox')
      .set('x-valle-test-harness', TEST_HARNESS_KEY)
      .query({ recipient })
      .expect(200);
    return response.body as HarnessEmail;
  }

  async function registerVerifyAndLogin(email: string): Promise<LoginContext> {
    const server = app.getHttpServer();
    await request(server)
      .post('/v1/auth/register')
      .send({ email, password: PASSWORD, displayName: email.split('@')[0] })
      .expect(202);
    const verificationEmail = await latestEmail(email);
    await request(server)
      .post('/v1/auth/verify-email')
      .send({ token: verificationEmail.payload.token })
      .expect(201);
    const agent = request.agent(server);
    const login = await agent
      .post('/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    const loginBody = login.body as unknown as { user: { id: string } };
    return {
      agent,
      csrf: responseCookie(login, CSRF_COOKIE),
      userId: loginBody.user.id,
    };
  }

  it('el owner que pidió el upgrade NO puede confirmarlo: 403, sin mutar la suscripción', async () => {
    app = await buildApp();
    dataSource = app.get(DataSource);

    const owner = await registerVerifyAndLogin(
      'owner+confirm-http@example.test',
    );
    const org = await owner.agent
      .post('/v1/organizations')
      .set('x-csrf-token', owner.csrf)
      .send({ name: 'Owner confirm org', slug: 'owner-confirm-org' })
      .expect(201);
    const organizationId = (org.body as { id: string }).id;

    // `standalone-full` ya lo siembra `CommercialCatalogBootstrap` al
    // arrancar el módulo — no hace falta insertarlo aquí.
    const created = await owner.agent
      .post('/v1/commercial/upgrade-intents')
      .set('x-csrf-token', owner.csrf)
      .send({ requestedPlanCode: 'standalone-full' })
      .expect(201);
    const intentId = (created.body as UpgradeIntentBody).id;
    expect((created.body as UpgradeIntentBody).status).toBe('pending');

    const confirmAttempt = await owner.agent
      .post(`/v1/commercial/upgrade-intents/${intentId}/confirm`)
      .set('x-csrf-token', owner.csrf)
      .send();
    expect([403, 404]).toContain(confirmAttempt.status);
    expect(confirmAttempt.body).toMatchObject({
      code: 'assisted_checkout_confirmation_retired',
    });

    // La suscripción sigue en el trial: NINGÚN campo cambió.
    await owner.agent
      .get('/v1/commercial/subscription')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          subscription: { planCode: 'standalone-trial', status: 'trialing' },
        });
      });
    await expect(
      dataSource
        .getRepository(SubscriptionUpgradeIntent)
        .findOneByOrFail({ id: intentId }),
    ).resolves.toMatchObject({
      status: 'pending',
      decidedByUserId: null,
      decidedAt: null,
    });
    await expect(
      dataSource
        .getRepository(Subscription)
        .findOneByOrFail({ organizationId }),
    ).resolves.toMatchObject({ status: 'trialing' });
    await expect(dataSource.getRepository(DomainOutbox).count()).resolves.toBe(
      0,
    );
  });

  it('un admin de la MISMA organización tampoco puede confirmar: 403, sin mutar', async () => {
    app = await buildApp();
    dataSource = app.get(DataSource);

    const owner = await registerVerifyAndLogin(
      'owner+confirm-admin@example.test',
    );
    const org = await owner.agent
      .post('/v1/organizations')
      .set('x-csrf-token', owner.csrf)
      .send({ name: 'Admin confirm org', slug: 'admin-confirm-org' })
      .expect(201);
    const organizationId = (org.body as { id: string }).id;
    const created = await owner.agent
      .post('/v1/commercial/upgrade-intents')
      .set('x-csrf-token', owner.csrf)
      .send({ requestedPlanCode: 'standalone-full' })
      .expect(201);
    const intentId = (created.body as UpgradeIntentBody).id;

    // Segundo usuario, admitido directamente como `admin` (sin recorrer el
    // flujo de invitación por correo, que ya está probado en
    // organizations.integration.spec.ts) y con esa organización activa.
    const adminUser = await registerVerifyAndLogin(
      'admin+confirm-admin@example.test',
    );
    await dataSource.getRepository(Membership).save({
      organizationId,
      userId: adminUser.userId,
      role: 'admin',
    });
    await dataSource
      .getRepository(Session)
      .update(
        { userId: adminUser.userId },
        { activeOrganizationId: organizationId },
      );

    const confirmAttempt = await adminUser.agent
      .post(`/v1/commercial/upgrade-intents/${intentId}/confirm`)
      .set('x-csrf-token', adminUser.csrf)
      .send();
    expect([403, 404]).toContain(confirmAttempt.status);

    await expect(
      dataSource
        .getRepository(SubscriptionUpgradeIntent)
        .findOneByOrFail({ id: intentId }),
    ).resolves.toMatchObject({ status: 'pending' });
    await expect(
      dataSource
        .getRepository(Subscription)
        .findOneByOrFail({ organizationId }),
    ).resolves.toMatchObject({ status: 'trialing' });
  });

  it('con un proveedor de pagos REAL activo (no nulo) la confirmación manual sigue retirada', async () => {
    app = await buildApp(fakeRealPaymentProvider());
    dataSource = app.get(DataSource);

    const owner = await registerVerifyAndLogin(
      'owner+confirm-stripe@example.test',
    );
    const org = await owner.agent
      .post('/v1/organizations')
      .set('x-csrf-token', owner.csrf)
      .send({ name: 'Stripe confirm org', slug: 'stripe-confirm-org' })
      .expect(201);
    const organizationId = (org.body as { id: string }).id;
    const created = await owner.agent
      .post('/v1/commercial/upgrade-intents')
      .set('x-csrf-token', owner.csrf)
      .send({ requestedPlanCode: 'standalone-full' })
      .expect(201);
    const intentId = (created.body as UpgradeIntentBody).id;

    const confirmAttempt = await owner.agent
      .post(`/v1/commercial/upgrade-intents/${intentId}/confirm`)
      .set('x-csrf-token', owner.csrf)
      .send();
    expect([403, 404]).toContain(confirmAttempt.status);
    await expect(
      dataSource
        .getRepository(Subscription)
        .findOneByOrFail({ organizationId }),
    ).resolves.toMatchObject({ status: 'trialing' });
  });

  it('sin sesión (no autenticado) sigue siendo 401, no el 403 de retirada', async () => {
    app = await buildApp();
    const anonymous = await request(app.getHttpServer())
      .post(
        `/v1/commercial/upgrade-intents/00000000-0000-4000-8000-000000000000/confirm`,
      )
      .send();
    expect(anonymous.status).toBe(401);
  });
});
