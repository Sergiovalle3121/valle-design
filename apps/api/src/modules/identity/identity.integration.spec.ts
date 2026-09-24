import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource, IsNull } from 'typeorm';
import { currentLegalDocument } from '../legal/legal-documents';
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
import { RegistrationLegalAcceptance } from './entities/registration-legal-acceptance.entity';
import {
  CSRF_COOKIE,
  DEVELOPMENT_SESSION_COOKIE,
  hashOpaqueToken,
} from './identity-security';

const TEST_HARNESS_KEY = 'identity-harness-key-with-at-least-32-chars';
const EMAIL = 'flow.user+identity@example.test';
const UNKNOWN_EMAIL = 'missing.user+identity@example.test';
const OLD_PASSWORD = 'Old-password-2026!';
const NEW_PASSWORD = 'New-password-2026!';
const LEGAL_CONFIRMATION = {
  termsVersion: currentLegalDocument('terms')!.version,
  acceptedTerms: true,
};

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
  const header = setCookieHeaders(response).find(
    (entry) => entry.startsWith(prefix) && !entry.startsWith(`${prefix};`),
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
            RegistrationLegalAcceptance,
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
        ...LEGAL_CONFIRMATION,
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
      .expect({ verified: true, email: EMAIL });
    // Segundo canje del MISMO enlace: sigue siendo de un solo uso (no cambia
    // nada), pero la respuesta dice la verdad —ya estaba verificado— en vez
    // de un 400 que parecía un fallo del producto.
    await request(server)
      .post('/v1/auth/verify-email')
      .send({ token: verification.payload.token })
      .expect(201)
      .expect({ verified: true, alreadyVerified: true, email: EMAIL });

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

    const primarySession = (await primary
      .get('/v1/auth/session')
      .expect(200)) as {
      body: {
        session: { id: string };
        user: {
          id: string;
          email: string;
          emailVerified: boolean;
        };
      };
    };
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
    const secondarySession = (await secondary
      .get('/v1/auth/session')
      .expect(200)) as { body: { session: { id: string } } };

    interface SessionInfo {
      id: string;
      current: boolean;
      userAgent: string;
    }
    const listed = (await primary.get('/v1/auth/sessions').expect(200)) as {
      body: { sessions: SessionInfo[] };
    };
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
    const revokedSession = await dataSource
      .getRepository(Session)
      .findOneByOrFail({ id: secondarySession.body.session.id });
    expect(revokedSession.revokedAt).toBeInstanceOf(Date);

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

  it('requires explicit current terms and never trusts caller identity or timestamp', async () => {
    const server = app.getHttpServer();
    const known = 'known.legal+identity@example.test';
    const fresh = 'fresh.legal+identity@example.test';
    const credentials = { password: OLD_PASSWORD, displayName: 'Legal Flow' };
    await request(server)
      .post('/v1/auth/register')
      .send({ email: known, ...credentials, ...LEGAL_CONFIRMATION })
      .expect(202);

    const stale = { ...LEGAL_CONFIRMATION, termsVersion: '1999-01-01' };
    const existingRejected = await request(server)
      .post('/v1/auth/register')
      .send({ email: known, ...credentials, ...stale })
      .expect(400);
    const freshRejected = await request(server)
      .post('/v1/auth/register')
      .send({ email: fresh, ...credentials, ...stale })
      .expect(400);
    expect(existingRejected.body).toEqual(freshRejected.body);

    await request(server)
      .post('/v1/auth/register')
      .send({ email: fresh, ...credentials })
      .expect(400);
    await request(server)
      .post('/v1/auth/register')
      .send({
        email: fresh,
        ...credentials,
        termsVersion: LEGAL_CONFIRMATION.termsVersion,
        acceptedTerms: 'false',
      })
      .expect(400);
    await request(server)
      .post('/v1/auth/register')
      .send({
        email: fresh,
        ...credentials,
        ...LEGAL_CONFIRMATION,
        userId: 'forged',
        acceptedAt: '1999-01-01',
      })
      .expect(400);

    await expect(
      dataSource.getRepository(User).countBy({ email: fresh }),
    ).resolves.toBe(0);
    const repeated = await request(server)
      .post('/v1/auth/register')
      .send({ email: known, ...credentials, ...LEGAL_CONFIRMATION })
      .expect(202);
    const newRegistration = await request(server)
      .post('/v1/auth/register')
      .send({ email: fresh, ...credentials, ...LEGAL_CONFIRMATION })
      .expect(202);
    expect(repeated.body).toEqual(newRegistration.body);

    const user = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: known });
    await expect(
      dataSource
        .getRepository(RegistrationLegalAcceptance)
        .countBy({ userId: user.id }),
    ).resolves.toBe(1);
    const freshUser = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: fresh });
    await expect(
      dataSource
        .getRepository(RegistrationLegalAcceptance)
        .countBy({ userId: freshUser.id }),
    ).resolves.toBe(1);
  });

  it('does not enumerate accounts through forgot or verification resend', async () => {
    const server = app.getHttpServer();
    // La propiedad de no-enumeración no requiere escrituras simultáneas.
    // SQLite usa una única conexión en esta suite focal y no admite dos
    // transacciones de rotación concurrentes; las carreras reales se prueban
    // aparte contra PostgreSQL.
    const knownForgot = await request(server)
      .post('/v1/auth/password/forgot')
      .send({ email: EMAIL });
    const unknownForgot = await request(server)
      .post('/v1/auth/password/forgot')
      .send({ email: UNKNOWN_EMAIL });
    const knownResend = await request(server)
      .post('/v1/auth/verify-email/resend')
      .send({ email: EMAIL });
    const unknownResend = await request(server)
      .post('/v1/auth/verify-email/resend')
      .send({ email: UNKNOWN_EMAIL });

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

  it('el reenvío no mata el correo anterior, y cada negativa dice por qué', async () => {
    const server = app.getHttpServer();
    const email = 'resend.user+identity@example.test';
    await request(server)
      .post('/v1/auth/register')
      .send({
        email,
        password: OLD_PASSWORD,
        displayName: 'Resend Flow',
        ...LEGAL_CONFIRMATION,
      })
      .expect(202);
    await request(server)
      .post('/v1/auth/verify-email/resend')
      .send({ email })
      .expect(202);
    await request(server)
      .post('/v1/auth/verify-email/resend')
      .send({ email })
      .expect(202);

    const outbox = await dataSource.getRepository(EmailOutbox).find({
      where: { recipient: email, template: 'identity.verify-email' },
      order: { createdAt: 'ASC' },
    });
    expect(outbox).toHaveLength(3);
    const tokens = outbox.map(
      (row) => (row.payload as EmailHarnessBody['payload']).token,
    );
    expect(new Set(tokens).size).toBe(3);

    const user = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email });
    const oneTimeTokens = dataSource.getRepository(OneTimeToken);
    await expect(
      oneTimeTokens.countBy({
        subjectId: user.id,
        purpose: 'verify_email',
        consumedAt: IsNull(),
      }),
    ).resolves.toBe(3);

    // Un enlace caducado (aún sin consumir) lo dice con su código propio.
    // Por hash y no por orden: SQLite guarda `createdAt` con precisión de
    // segundo y tres filas del mismo segundo no tienen orden estable.
    const secondToken = await oneTimeTokens.findOneByOrFail({
      tokenHash: hashOpaqueToken(tokens[1]),
    });
    await oneTimeTokens.update(secondToken.id, {
      expiresAt: new Date(Date.now() - 1_000),
    });
    const expired = await request(server)
      .post('/v1/auth/verify-email')
      .send({ token: tokens[1] })
      .expect(400);
    expect(expired.body).toMatchObject({ code: 'verification_token_expired' });

    // Un enlace consumido por un reemplazo (cambio de correo) sin que la
    // cuenta esté verificada: «abre el correo más reciente».
    await oneTimeTokens.update(secondToken.id, {
      expiresAt: new Date(Date.now() + 3_600_000),
      consumedAt: new Date(),
    });
    const superseded = await request(server)
      .post('/v1/auth/verify-email')
      .send({ token: tokens[1] })
      .expect(400);
    expect(superseded.body).toMatchObject({
      code: 'verification_token_superseded',
    });

    // El PRIMER correo —el que llegó antes— sigue verificando tras dos
    // reenvíos. Antes moría con el primer «enviar otro».
    await request(server)
      .post('/v1/auth/verify-email')
      .send({ token: tokens[0] })
      .expect(201)
      .expect({ verified: true, email });
    await expect(
      oneTimeTokens.countBy({
        subjectId: user.id,
        purpose: 'verify_email',
        consumedAt: IsNull(),
      }),
    ).resolves.toBe(0);
    // El tercero ya no abre nada, pero tampoco asusta: ya estaba verificado.
    await request(server)
      .post('/v1/auth/verify-email')
      .send({ token: tokens[2] })
      .expect(201)
      .expect({ verified: true, alreadyVerified: true, email });
    // Un token que nunca existió sigue siendo el 400 genérico.
    await request(server)
      .post('/v1/auth/verify-email')
      .send({ token: 'x'.repeat(43) })
      .expect(400)
      .expect((response: { body: Record<string, unknown> }) => {
        expect(response.body.code).toBeUndefined();
      });
  });
});

describe('CSRF cookie domain integration', () => {
  jest.setTimeout(30_000);

  let app: NestExpressApplication;
  const originalDomain = process.env.CSRF_COOKIE_DOMAIN;
  const originalAllowed = process.env.ALLOWED_ORIGIN;
  const originalHarness = process.env.IDENTITY_TEST_HARNESS;
  const originalHarnessKey = process.env.IDENTITY_TEST_HARNESS_KEY;

  beforeAll(async () => {
    process.env.CSRF_COOKIE_DOMAIN = '.ejemplo.test';
    process.env.ALLOWED_ORIGIN = 'https://app.ejemplo.test';
    process.env.IDENTITY_TEST_HARNESS = 'true';
    process.env.IDENTITY_TEST_HARNESS_KEY =
      'csrf-domain-harness-key-at-least-32';

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
    const restore = (key: string, original: string | undefined) => {
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    };
    restore('CSRF_COOKIE_DOMAIN', originalDomain);
    restore('ALLOWED_ORIGIN', originalAllowed);
    restore('IDENTITY_TEST_HARNESS', originalHarness);
    restore('IDENTITY_TEST_HARNESS_KEY', originalHarnessKey);
  });

  it('sets CSRF cookie with Domain and clears the host-only legacy cookie on login', async () => {
    const server = app.getHttpServer();
    const EMAIL = 'csrf-domain-flow@example.test';
    const PASSWORD = 'Csrf-domain-test-2026!';

    await request(server)
      .post('/v1/auth/register')
      .send({
        email: EMAIL,
        password: PASSWORD,
        displayName: 'CSRF Test',
        ...LEGAL_CONFIRMATION,
      })
      .expect(202);

    const verificationEmail = await request(server)
      .get('/_development/email-outbox')
      .set('x-valle-test-harness', 'csrf-domain-harness-key-at-least-32')
      .query({ recipient: EMAIL })
      .expect(200);
    const token = (verificationEmail.body as EmailHarnessBody).payload.token;
    await request(server)
      .post('/v1/auth/verify-email')
      .send({ token })
      .expect(201);

    const login = await request(server)
      .post('/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);

    const headers = setCookieHeaders(login);
    const csrfHeaders = headers.filter((h) => h.startsWith(`${CSRF_COOKIE}=`));
    expect(csrfHeaders.length).toBeGreaterThanOrEqual(1);

    const withDomain = csrfHeaders.find((h) =>
      h.includes('Domain=.ejemplo.test'),
    );
    expect(withDomain).toBeDefined();

    const clearing = csrfHeaders.find(
      (h) => h.includes('Expires=') && !h.includes('Domain='),
    );
    expect(clearing).toBeDefined();

    const sessionHeader = headers.find((h) =>
      h.startsWith(`${DEVELOPMENT_SESSION_COOKIE}=`),
    );
    expect(sessionHeader).toBeDefined();
    expect(sessionHeader).not.toContain('Domain=');

    const csrf = cookieValue(login, CSRF_COOKIE);
    const sessionCookie = cookieValue(login, DEVELOPMENT_SESSION_COOKIE);
    // Debug: verify cookies are extracted
    expect(csrf).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(sessionCookie).toBeTruthy();
    const logout = await request(server)
      .post('/v1/auth/logout')
      .set(
        'Cookie',
        `${CSRF_COOKIE}=${csrf}; ${DEVELOPMENT_SESSION_COOKIE}=${sessionCookie}`,
      )
      .set('x-csrf-token', csrf)
      .expect(204);

    const logoutHeaders = setCookieHeaders(logout);
    const logoutCsrf = logoutHeaders.filter((h) =>
      h.startsWith(`${CSRF_COOKIE}=;`),
    );
    const logoutWithDomain = logoutCsrf.find((h) =>
      h.includes('Domain=.ejemplo.test'),
    );
    const logoutWithoutDomain = logoutCsrf.find((h) => !h.includes('Domain='));
    expect(logoutWithDomain).toBeDefined();
    expect(logoutWithoutDomain).toBeDefined();
  });
});
