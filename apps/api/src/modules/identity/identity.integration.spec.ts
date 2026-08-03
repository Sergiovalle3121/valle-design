import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource, IsNull } from 'typeorm';
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
import { CSRF_COOKIE, DEVELOPMENT_SESSION_COOKIE } from './identity-security';

const TEST_HARNESS_KEY = 'identity-harness-key-with-at-least-32-chars';
const EMAIL = 'flow.user+identity@example.test';
const UNKNOWN_EMAIL = 'missing.user+identity@example.test';
const OLD_PASSWORD = 'Old-password-2026!';
const NEW_PASSWORD = 'New-password-2026!';

interface EmailHarnessBody {
  template: string;
  payload: {
    token: string;
    path: string;
    expiresAt: string;
  };
}

function setCookieHeaders(response: request.Response): string[] {
  const value = response.headers['set-cookie'];
  if (!Array.isArray(value)) {
    throw new Error('Expected the response to set first-party cookies.');
  }
  return value;
}

function cookieValue(response: request.Response, name: string): string {
  const prefix = `${name}=`;
  const header = setCookieHeaders(response).find((entry) =>
    entry.startsWith(prefix),
  );
  if (!header) throw new Error(`Missing ${name} response cookie.`);
  return decodeURIComponent(header.slice(prefix.length).split(';', 1)[0]);
}

async function crossSecondBoundary(): Promise<void> {
  // SQLite's synchronized CreateDateColumn has second precision. Crossing the
  // boundary keeps the harness's latest-email lookup deterministic.
  const delay = 1_010 - (Date.now() % 1_000);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

describe('first-party identity HTTP integration', () => {
  jest.setTimeout(30_000);

  let app: NestExpressApplication;
  let dataSource: DataSource;
  const originalHarness = process.env.IDENTITY_TEST_HARNESS;
  const originalHarnessKey = process.env.IDENTITY_TEST_HARNESS_KEY;

  beforeAll(async () => {
    process.env.IDENTITY_TEST_HARNESS = 'true';
    process.env.IDENTITY_TEST_HARNESS_KEY = TEST_HARNESS_KEY;

    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          dropSchema: true,
          synchronize: true,
          autoLoadEntities: true,
          // Include every relation target, even when this focal test does not
          // create organizations or subscriptions.
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
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (originalHarness === undefined) {
      delete process.env.IDENTITY_TEST_HARNESS;
    } else {
      process.env.IDENTITY_TEST_HARNESS = originalHarness;
    }
    if (originalHarnessKey === undefined) {
      delete process.env.IDENTITY_TEST_HARNESS_KEY;
    } else {
      process.env.IDENTITY_TEST_HARNESS_KEY = originalHarnessKey;
    }
  });

  it('completes registration, verification, sessions, reset and logout without exposing credentials', async () => {
    const server = app.getHttpServer();

    const registration = await request(server)
      .post('/v1/auth/register')
      .send({
        email: EMAIL,
        password: OLD_PASSWORD,
        displayName: 'Identity Flow',
      })
      .expect(202);
    expect(registration.body).toEqual({ accepted: true });
    expect(JSON.stringify(registration.body)).not.toMatch(/token/iu);

    const unverifiedLogin = await request(server)
      .post('/v1/auth/login')
      .send({ email: EMAIL, password: OLD_PASSWORD })
      .expect(401);
    expect(JSON.stringify(unverifiedLogin.body)).not.toMatch(
      /unverified|verification|exists/iu,
    );
    await expect(dataSource.getRepository(Session).count()).resolves.toBe(0);

    await request(server)
      .get('/_development/email-outbox')
      .query({ recipient: EMAIL })
      .expect(404);
    await request(server)
      .get('/_development/email-outbox')
      .set('x-valle-test-harness', 'wrong-key-that-is-still-long-enough-000')
      .query({ recipient: EMAIL })
      .expect(404);
    await request(server)
      .get('/_development/email-outbox')
      .set('x-valle-test-harness', TEST_HARNESS_KEY)
      .query({ recipient: 'somebody-else@example.test' })
      .expect(404);

    process.env.IDENTITY_TEST_HARNESS = 'false';
    await request(server)
      .get('/_development/email-outbox')
      .set('x-valle-test-harness', TEST_HARNESS_KEY)
      .query({ recipient: EMAIL })
      .expect(404);
    process.env.IDENTITY_TEST_HARNESS = 'true';

    const verificationEmail = await request(server)
      .get('/_development/email-outbox')
      .set('x-valle-test-harness', TEST_HARNESS_KEY)
      .query({ recipient: EMAIL })
      .expect(200);
    const verification = verificationEmail.body as EmailHarnessBody;
    expect(verification.template).toBe('identity.verify-email');
    expect(verification.payload.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(verification.payload.path).toBe(
      `/verify-email?token=${encodeURIComponent(verification.payload.token)}`,
    );
    expect(new Date(verification.payload.expiresAt).getTime()).toBeGreaterThan(
      Date.now(),
    );

    const persistedVerification = await dataSource
      .getRepository(OneTimeToken)
      .findOneByOrFail({ purpose: 'verify_email' });
    expect(persistedVerification.tokenHash).not.toBe(
      verification.payload.token,
    );
    await expect(
      dataSource.getRepository(EmailOutbox).findOneByOrFail({
        recipient: EMAIL,
        organizationId: IsNull(),
        tenantId: IsNull(),
      }),
    ).resolves.toMatchObject({ template: 'identity.verify-email' });

    await request(server)
      .post('/v1/auth/verify-email')
      .send({ token: verification.payload.token })
      .expect(201)
      .expect({ verified: true });
    await request(server)
      .post('/v1/auth/verify-email')
      .send({ token: verification.payload.token })
      .expect(400);

    const verifiedUser = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: EMAIL });
    expect(verifiedUser.emailVerifiedAt).toBeInstanceOf(Date);

    const primary = request.agent(server);
    const primaryLogin = await primary
      .post('/v1/auth/login')
      .set('user-agent', 'identity-primary-test-agent')
      .send({ email: EMAIL, password: OLD_PASSWORD })
      .expect(200);
    expect(primaryLogin.body).toMatchObject({
      user: { id: verifiedUser.id, email: EMAIL },
    });
    const primaryCsrf = cookieValue(primaryLogin, CSRF_COOKIE);
    const primaryCookies = setCookieHeaders(primaryLogin);
    expect(
      primaryCookies.find((entry) =>
        entry.startsWith(`${DEVELOPMENT_SESSION_COOKIE}=`),
      ),
    ).toMatch(/HttpOnly.*SameSite=Lax/iu);
    expect(
      primaryCookies.find((entry) => entry.startsWith(`${CSRF_COOKIE}=`)),
    ).not.toMatch(/HttpOnly/iu);

    const primarySession = await primary.get('/v1/auth/session').expect(200);
    expect(primarySession.body).toMatchObject({
      user: { id: verifiedUser.id, email: EMAIL, emailVerified: true },
    });

    const secondary = request.agent(server);
    const secondaryLogin = await secondary
      .post('/v1/auth/login')
      .set('user-agent', 'identity-secondary-test-agent')
      .send({ email: EMAIL, password: OLD_PASSWORD })
      .expect(200);
    expect(cookieValue(secondaryLogin, CSRF_COOKIE)).toMatch(
      /^[A-Za-z0-9_-]{43}$/u,
    );
    const secondarySession = await secondary
      .get('/v1/auth/session')
      .expect(200);

    const listed = await primary.get('/v1/auth/sessions').expect(200);
    expect(listed.body.sessions).toHaveLength(2);
    expect(
      listed.body.sessions.filter(
        (session: { current: boolean }) => session.current,
      ),
    ).toHaveLength(1);
    expect(
      listed.body.sessions.find(
        (session: { id: string }) =>
          session.id === primarySession.body.session.id,
      ),
    ).toMatchObject({
      current: true,
      userAgent: 'identity-primary-test-agent',
    });

    await primary
      .delete(`/v1/auth/sessions/${secondarySession.body.session.id}`)
      .set('x-csrf-token', primaryCsrf)
      .expect(204);
    await secondary.get('/v1/auth/session').expect(401);
    await expect(
      dataSource.getRepository(Session).findOneByOrFail({
        id: secondarySession.body.session.id,
      }),
    ).resolves.toMatchObject({ revokedAt: expect.any(Date) });

    await crossSecondBoundary();
    const forgot = await request(server)
      .post('/v1/auth/password/forgot')
      .send({ email: EMAIL })
      .expect(202);
    expect(forgot.body).toEqual({ accepted: true });
    expect(JSON.stringify(forgot.body)).not.toMatch(/token/iu);

    const resetEmail = await request(server)
      .get('/_development/email-outbox')
      .set('x-valle-test-harness', TEST_HARNESS_KEY)
      .query({ recipient: EMAIL })
      .expect(200);
    const reset = resetEmail.body as EmailHarnessBody;
    expect(reset.template).toBe('identity.reset-password');
    expect(reset.payload.path).toBe(
      `/reset-password?token=${encodeURIComponent(reset.payload.token)}`,
    );

    await request(server)
      .post('/v1/auth/password/reset')
      .send({ token: reset.payload.token, password: NEW_PASSWORD })
      .expect(201)
      .expect({ reset: true });
    await primary.get('/v1/auth/session').expect(401);
    const sessionsAfterReset = await dataSource.getRepository(Session).find({
      where: { userId: verifiedUser.id },
    });
    expect(sessionsAfterReset).toHaveLength(2);
    expect(sessionsAfterReset.every((session) => !!session.revokedAt)).toBe(
      true,
    );

    await request(server)
      .post('/v1/auth/login')
      .send({ email: EMAIL, password: OLD_PASSWORD })
      .expect(401);

    const current = request.agent(server);
    const currentLogin = await current
      .post('/v1/auth/login')
      .send({ email: EMAIL, password: NEW_PASSWORD })
      .expect(200);
    const currentCsrf = cookieValue(currentLogin, CSRF_COOKIE);
    const logout = await current
      .post('/v1/auth/logout')
      .set('x-csrf-token', currentCsrf)
      .expect(204);
    expect(setCookieHeaders(logout)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          new RegExp(`^${DEVELOPMENT_SESSION_COOKIE}=;.*Expires=`, 'u'),
        ),
        expect.stringMatching(new RegExp(`^${CSRF_COOKIE}=;.*Expires=`, 'u')),
      ]),
    );
    await current.get('/v1/auth/session').expect(401);
  });

  it('does not enumerate accounts through forgot or verification resend', async () => {
    const server = app.getHttpServer();
    const [knownForgot, unknownForgot, knownResend, unknownResend] =
      await Promise.all([
        request(server).post('/v1/auth/password/forgot').send({ email: EMAIL }),
        request(server)
          .post('/v1/auth/password/forgot')
          .send({ email: UNKNOWN_EMAIL }),
        request(server)
          .post('/v1/auth/verify-email/resend')
          .send({ email: EMAIL }),
        request(server)
          .post('/v1/auth/verify-email/resend')
          .send({ email: UNKNOWN_EMAIL }),
      ]);

    for (const response of [
      knownForgot,
      unknownForgot,
      knownResend,
      unknownResend,
    ]) {
      expect(response.status).toBe(202);
      expect(response.body).toEqual({ accepted: true });
      expect(JSON.stringify(response.body)).not.toMatch(/token|exists/iu);
    }
    expect(knownForgot.body).toEqual(unknownForgot.body);
    expect(knownResend.body).toEqual(unknownResend.body);
  });
});
