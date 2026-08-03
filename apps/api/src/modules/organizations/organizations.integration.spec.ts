import { ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DESIGN_CAD_ENTITLEMENT } from '@valle-design/contracts';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { CadAuthGuard } from '../auth/guards/cad-auth.guard';
import {
  DomainOutbox,
  EmailOutbox,
  PlanCatalog,
  PlanEntitlement,
  Subscription,
  UsageLedger,
} from '../commercial/entities/commercial.entities';
import {
  ENTITLEMENT_SERVICE,
  type EntitlementService,
} from '../commercial/ports/commercial.ports';
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
} from './entities/organization.entity';
import { OrganizationsModule } from './organizations.module';

const TEST_HARNESS_KEY = 'organization-harness-key-with-at-least-32-characters';
const PASSWORD = 'Organization-flow-2026!';
const USER_A_EMAIL = 'owner-a+organizations@example.test';
const USER_B_EMAIL = 'invitee-b+organizations@example.test';
const TRIAL_DAYS = 3;

interface LoginContext {
  agent: request.Agent;
  csrf: string;
  userId: string;
}

interface HarnessEmail {
  template: string;
  payload: { token: string; organizationName?: string };
}

interface OrganizationCreationBody {
  id: string;
  subscription: { trialEndsAt: string };
}

interface OrganizationSessionBody {
  organization: {
    id: string;
    name: string;
    slug: string;
    tenantId: string;
    role: string;
    permissions: string[];
  } | null;
}

interface OrganizationListBody {
  items: Array<{ id: string; role: string; active: boolean }>;
}

interface OrganizationMembershipListBody {
  items: Array<{
    userId: string;
    email: string;
    role: string;
    currentUser: boolean;
  }>;
}

function responseCookie(response: request.Response, name: string): string {
  const cookies = response.headers['set-cookie'] as unknown;
  if (!isStringArray(cookies)) {
    throw new Error('Expected first-party response cookies.');
  }
  const prefix = `${name}=`;
  const header = cookies.find((entry) => entry.startsWith(prefix));
  if (!header) throw new Error(`Missing ${name} response cookie.`);
  return decodeURIComponent(header.slice(prefix.length).split(';', 1)[0]);
}

describe('first-party organization and commercial HTTP integration', () => {
  jest.setTimeout(45_000);

  let app: NestExpressApplication;
  let dataSource: DataSource;
  let entitlements: EntitlementService;
  const originalHarness = process.env.IDENTITY_TEST_HARNESS;
  const originalHarnessKey = process.env.IDENTITY_TEST_HARNESS_KEY;
  const originalTrialDays = process.env.TRIAL_DAYS;

  beforeAll(async () => {
    process.env.IDENTITY_TEST_HARNESS = 'true';
    process.env.IDENTITY_TEST_HARNESS_KEY = TEST_HARNESS_KEY;
    process.env.TRIAL_DAYS = String(TRIAL_DAYS);

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
        OrganizationsModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: CadAuthGuard }],
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
    entitlements = app.get(ENTITLEMENT_SERVICE);
  });

  afterAll(async () => {
    if (app) await app.close();
    restoreEnvironment('IDENTITY_TEST_HARNESS', originalHarness);
    restoreEnvironment('IDENTITY_TEST_HARNESS_KEY', originalHarnessKey);
    restoreEnvironment('TRIAL_DAYS', originalTrialDays);
  });

  async function latestEmail(
    recipient: string,
    tenantId?: string,
  ): Promise<HarnessEmail> {
    let call = request(app.getHttpServer())
      .get('/_development/email-outbox')
      .set('x-valle-test-harness', TEST_HARNESS_KEY)
      .query({ recipient });
    if (tenantId) call = call.query({ tenantId });
    const response = await call.expect(200);
    return response.body as HarnessEmail;
  }

  async function registerVerifyAndLogin(email: string): Promise<LoginContext> {
    const server = app.getHttpServer();
    const registration = await request(server)
      .post('/v1/auth/register')
      .send({ email, password: PASSWORD, displayName: email.split('@')[0] })
      .expect(202);
    expect(registration.body).toEqual({ accepted: true });
    expect(JSON.stringify(registration.body)).not.toMatch(/token/iu);

    const verificationEmail = await latestEmail(email);
    expect(verificationEmail.template).toBe('identity.verify-email');
    await request(server)
      .post('/v1/auth/verify-email')
      .send({ token: verificationEmail.payload.token })
      .expect(201)
      .expect({ verified: true });

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

  it('creates tenant-owned trials and completes a non-enumerating invitation flow', async () => {
    const server = app.getHttpServer();
    const owner = await registerVerifyAndLogin(USER_A_EMAIL);
    await owner.agent
      .post('/v1/organizations')
      .set('x-csrf-token', owner.csrf)
      .send({ name: ' \t\r\n ', slug: 'blank-name' })
      .expect(400);
    await expect(dataSource.getRepository(Organization).count()).resolves.toBe(
      0,
    );

    const trialStartedAt = Date.now();
    const firstCreation = await owner.agent
      .post('/v1/organizations')
      .set('x-csrf-token', owner.csrf)
      .send({ name: '  Design Norte  ', slug: 'design-norte' })
      .expect(201);
    const firstCreationBody =
      firstCreation.body as unknown as OrganizationCreationBody;
    const firstOrganizationId = firstCreationBody.id;
    expect(firstCreationBody).toMatchObject({
      name: 'Design Norte',
      slug: 'design-norte',
      tenantId: firstOrganizationId,
      subscription: {
        planCode: 'standalone-trial',
        status: 'trialing',
      },
    });
    expect(
      new Date(firstCreationBody.subscription.trialEndsAt).getTime(),
    ).toBeGreaterThanOrEqual(trialStartedAt + TRIAL_DAYS * 86_400_000 - 1_000);
    expect(
      new Date(firstCreationBody.subscription.trialEndsAt).getTime(),
    ).toBeLessThanOrEqual(Date.now() + TRIAL_DAYS * 86_400_000 + 1_000);

    const subscription = await dataSource
      .getRepository(Subscription)
      .findOneByOrFail({ organizationId: firstOrganizationId });
    expect(subscription).toMatchObject({
      tenantId: firstOrganizationId,
      planCode: 'standalone-trial',
      status: 'trialing',
    });
    await expect(
      dataSource.getRepository(PlanEntitlement).findOneByOrFail({
        planCode: 'standalone-trial',
        entitlementCode: DESIGN_CAD_ENTITLEMENT,
      }),
    ).resolves.toBeDefined();

    const firstSession = await owner.agent.get('/v1/auth/session').expect(200);
    const firstSessionBody =
      firstSession.body as unknown as OrganizationSessionBody;
    expect(firstSessionBody.organization).toMatchObject({
      id: firstOrganizationId,
      tenantId: firstOrganizationId,
      role: 'owner',
    });
    expect(firstSessionBody.organization?.permissions).toEqual(
      expect.arrayContaining([
        'cad:view',
        'cad:edit',
        'cad:review',
        'cad:publish',
        'cad:admin',
      ]),
    );

    const firstMemberships = await owner.agent
      .get(`/v1/organizations/${firstOrganizationId}/memberships`)
      .expect(200);
    const firstMembershipsBody =
      firstMemberships.body as unknown as OrganizationMembershipListBody;
    expect(firstMembershipsBody.items).toEqual([
      expect.objectContaining({
        userId: owner.userId,
        email: USER_A_EMAIL,
        role: 'owner',
        currentUser: true,
      }),
    ]);

    await owner.agent
      .get('/v1/commercial/subscription')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          organizationId: firstOrganizationId,
          subscription: {
            planCode: 'standalone-trial',
            status: 'trialing',
            effective: true,
          },
        });
      });
    await owner.agent.get('/v1/commercial/entitlements').expect(200, {
      organizationId: firstOrganizationId,
      items: [DESIGN_CAD_ENTITLEMENT],
    });

    const plans = dataSource.getRepository(PlanCatalog);
    await plans.update({ code: 'standalone-trial' }, { active: false });
    await owner.agent
      .post('/v1/organizations')
      .set('x-csrf-token', owner.csrf)
      .send({ name: 'Design Sur', slug: 'design-sur' })
      .expect(503)
      .expect(({ body }) => {
        expect(body).toMatchObject({ code: 'trial_catalog_unavailable' });
      });
    await expect(
      plans.findOneByOrFail({ code: 'standalone-trial' }),
    ).resolves.toMatchObject({ active: false });
    await plans.update({ code: 'standalone-trial' }, { active: true });

    await owner.agent
      .post('/v1/organizations')
      .set('x-csrf-token', owner.csrf)
      .send({ name: 'Design Sur', slug: 'design-sur' })
      .expect(409)
      .expect(({ body }) => {
        expect(body).toMatchObject({ code: 'trial_already_granted' });
      });
    await expect(dataSource.getRepository(Subscription).count()).resolves.toBe(
      1,
    );

    // A second organization can still come from an external paid/admin
    // provisioning flow; membership switching must not mint another trial.
    const secondOrganization = await dataSource
      .getRepository(Organization)
      .save({
        name: 'Design Sur provisionado',
        slug: 'design-sur-provisioned',
        ownerUserId: owner.userId,
      });
    const secondOrganizationId = secondOrganization.id;
    await dataSource.getRepository(Membership).save({
      organizationId: secondOrganizationId,
      userId: owner.userId,
      role: 'owner',
    });
    await dataSource
      .getRepository(Session)
      .update(
        { userId: owner.userId },
        { activeOrganizationId: secondOrganizationId },
      );

    const ownerOrganizations = await owner.agent
      .get('/v1/organizations')
      .expect(200);
    const ownerOrganizationsBody =
      ownerOrganizations.body as unknown as OrganizationListBody;
    expect(ownerOrganizationsBody.items).toHaveLength(2);
    expect(ownerOrganizationsBody.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: firstOrganizationId,
          role: 'owner',
          active: false,
        }),
        expect.objectContaining({
          id: secondOrganizationId,
          role: 'owner',
          active: true,
        }),
      ]),
    );

    const activation = await owner.agent
      .post('/v1/organizations/active')
      .set('x-csrf-token', owner.csrf)
      .send({ organizationId: firstOrganizationId })
      .expect(201);
    expect(activation.body).toMatchObject({
      organization: { id: firstOrganizationId },
      tenantId: firstOrganizationId,
      role: 'owner',
    });

    const duplicate = await owner.agent
      .post('/v1/organizations')
      .set('x-csrf-token', owner.csrf)
      .send({ name: 'Un duplicado', slug: 'design-norte' })
      .expect(400);
    expect(JSON.stringify(duplicate.body)).not.toMatch(
      /SQLITE|constraint|query|stack/iu,
    );
    await expect(
      dataSource.getRepository(Organization).countBy({ slug: 'design-norte' }),
    ).resolves.toBe(1);

    await owner.agent
      .post(`/v1/organizations/${firstOrganizationId}/invitations`)
      .set('x-csrf-token', owner.csrf)
      .send({ email: USER_A_EMAIL, role: 'viewer' })
      .expect(201);
    const selfInvitation = await latestEmail(USER_A_EMAIL, firstOrganizationId);
    await owner.agent
      .post('/v1/organizations/invitations/accept')
      .set('x-csrf-token', owner.csrf)
      .send({ token: selfInvitation.payload.token })
      .expect(201)
      .expect({
        accepted: true,
        organizationId: firstOrganizationId,
        role: 'owner',
      });
    await expect(
      dataSource.getRepository(Membership).findOneByOrFail({
        organizationId: firstOrganizationId,
        userId: owner.userId,
      }),
    ).resolves.toMatchObject({ role: 'owner' });

    const invitationResponse = await owner.agent
      .post(`/v1/organizations/${firstOrganizationId}/invitations`)
      .set('x-csrf-token', owner.csrf)
      .send({ email: USER_B_EMAIL, role: 'viewer' })
      .expect(201);
    expect(invitationResponse.body).toMatchObject({ accepted: true });
    expect(JSON.stringify(invitationResponse.body)).not.toMatch(/token/iu);

    await request(server)
      .get('/_development/email-outbox')
      .query({ recipient: USER_B_EMAIL, tenantId: firstOrganizationId })
      .expect(404);
    await request(server)
      .get('/_development/email-outbox')
      .set('x-valle-test-harness', TEST_HARNESS_KEY)
      .query({
        recipient: USER_B_EMAIL,
        tenantId: '00000000-0000-4000-8000-000000000001',
      })
      .expect(404);
    const invitationEmail = await latestEmail(
      USER_B_EMAIL,
      firstOrganizationId,
    );
    expect(invitationEmail).toMatchObject({
      template: 'organization.invitation',
      payload: { organizationName: 'Design Norte' },
    });
    expect(invitationEmail.payload.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);

    const invitee = await registerVerifyAndLogin(USER_B_EMAIL);
    await invitee.agent.get('/v1/organizations').expect(200, { items: [] });
    await invitee.agent
      .get(`/v1/organizations/${firstOrganizationId}/memberships`)
      .expect(404);
    await invitee.agent.get('/v1/commercial/subscription').expect(200, {
      organizationId: null,
      subscription: null,
    });
    await invitee.agent.get('/v1/commercial/entitlements').expect(200, {
      organizationId: null,
      items: [],
    });
    await invitee.agent
      .post('/v1/organizations/active')
      .set('x-csrf-token', invitee.csrf)
      .send({ organizationId: firstOrganizationId })
      .expect(404);
    await invitee.agent
      .post(`/v1/organizations/${firstOrganizationId}/invitations`)
      .set('x-csrf-token', invitee.csrf)
      .send({ email: 'third-person@example.test', role: 'member' })
      .expect(404);

    await invitee.agent
      .post('/v1/organizations/invitations/accept')
      .set('x-csrf-token', invitee.csrf)
      .send({ token: invitationEmail.payload.token })
      .expect(201)
      .expect({
        accepted: true,
        organizationId: firstOrganizationId,
        role: 'viewer',
      });

    await expect(
      dataSource.getRepository(Membership).findOneByOrFail({
        organizationId: firstOrganizationId,
        userId: invitee.userId,
      }),
    ).resolves.toMatchObject({ role: 'viewer' });
    const visibleMemberships = await owner.agent
      .get(`/v1/organizations/${firstOrganizationId}/memberships`)
      .expect(200);
    const visibleMembershipsBody =
      visibleMemberships.body as unknown as OrganizationMembershipListBody;
    expect(visibleMembershipsBody.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: owner.userId, role: 'owner' }),
        expect.objectContaining({ userId: invitee.userId, role: 'viewer' }),
      ]),
    );
    const inviteeSession = await invitee.agent
      .get('/v1/auth/session')
      .expect(200);
    const inviteeSessionBody =
      inviteeSession.body as unknown as OrganizationSessionBody;
    expect(inviteeSessionBody.organization).toEqual({
      id: firstOrganizationId,
      name: 'Design Norte',
      slug: 'design-norte',
      tenantId: firstOrganizationId,
      role: 'viewer',
      permissions: ['cad:view', 'cad:review'],
    });

    const inviteeOrganizations = await invitee.agent
      .get('/v1/organizations')
      .expect(200);
    const inviteeOrganizationsBody =
      inviteeOrganizations.body as unknown as OrganizationListBody;
    expect(inviteeOrganizationsBody.items).toEqual([
      expect.objectContaining({
        id: firstOrganizationId,
        role: 'viewer',
        active: true,
      }),
    ]);
    await invitee.agent
      .post('/v1/organizations/active')
      .set('x-csrf-token', invitee.csrf)
      .send({ organizationId: secondOrganizationId })
      .expect(404);

    await expect(
      entitlements.hasEntitlement(DESIGN_CAD_ENTITLEMENT, {
        organizationId: firstOrganizationId,
        tenantId: firstOrganizationId,
      }),
    ).resolves.toBe(true);

    const subscriptions = dataSource.getRepository(Subscription);
    await subscriptions.update(subscription.id, {
      status: 'trialing',
      trialEndsAt: new Date(Date.now() - 1_000),
    });
    await expect(
      entitlements.hasEntitlement(DESIGN_CAD_ENTITLEMENT, {
        organizationId: firstOrganizationId,
        tenantId: firstOrganizationId,
      }),
    ).resolves.toBe(false);

    await subscriptions.update(subscription.id, {
      status: 'trialing',
      trialEndsAt: new Date(Date.now() + 60_000),
    });
    await expect(
      entitlements.hasEntitlement(DESIGN_CAD_ENTITLEMENT, {
        organizationId: firstOrganizationId,
        tenantId: firstOrganizationId,
      }),
    ).resolves.toBe(true);

    for (const status of ['suspended', 'cancelled', 'past_due'] as const) {
      await subscriptions.update(subscription.id, { status });
      await expect(
        entitlements.hasEntitlement(DESIGN_CAD_ENTITLEMENT, {
          organizationId: firstOrganizationId,
          tenantId: firstOrganizationId,
        }),
      ).resolves.toBe(false);
    }

    await subscriptions.update(subscription.id, {
      status: 'active',
      trialEndsAt: new Date(Date.now() - 86_400_000),
    });
    await expect(
      entitlements.hasEntitlement(DESIGN_CAD_ENTITLEMENT, {
        organizationId: firstOrganizationId,
        tenantId: firstOrganizationId,
      }),
    ).resolves.toBe(true);
    await expect(
      entitlements.hasEntitlement(DESIGN_CAD_ENTITLEMENT, {
        organizationId: firstOrganizationId,
        tenantId: secondOrganizationId,
      }),
    ).resolves.toBe(false);
  });
});

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry: unknown) => typeof entry === 'string')
  );
}
