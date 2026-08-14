import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import {
  DomainOutbox,
  EmailOutbox,
  PlanCatalog,
  PlanEntitlement,
  PlanPrice,
  Subscription,
  UsageLedger,
} from '../commercial/entities/commercial.entities';
import { CommercialCatalogBootstrap } from '../commercial/commercial-catalog.bootstrap';
import { Session, User } from '../identity/entities/identity.entity';
import type { IdentityService } from '../identity/identity.service';
import { OrganizationAccessService } from './organization-access.service';
import {
  Invitation,
  Membership,
  Organization,
} from './entities/organization.entity';
import { OrganizationsController } from './organizations.controller';

describePostgres('Organization creation atomicity', () => {
  jest.setTimeout(60_000);

  let harness: PostgresHarness;

  beforeAll(async () => {
    harness = await createPostgresHarness(
      [
        User,
        Session,
        Organization,
        Membership,
        Invitation,
        PlanCatalog,
        PlanEntitlement,
        PlanPrice,
        Subscription,
        UsageLedger,
        DomainOutbox,
        EmailOutbox,
      ],
      { schemaPrefix: 'organization_creation' },
    );
  });

  afterAll(async () => {
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    await harness.truncateAll();
    await new CommercialCatalogBootstrap(
      harness.dataSource,
    ).onApplicationBootstrap();
  });

  it('commits one trial and returns a generic 400 when the same slug races', async () => {
    const users = harness.dataSource.getRepository(User);
    const sessions = harness.dataSource.getRepository(Session);
    const actor = async (label: string, hashCharacter: string) => {
      const user = await users.save(
        users.create({
          email: `organization-race-${label}-${randomUUID()}@example.test`,
          displayName: `Organization Race ${label}`,
          emailVerifiedAt: new Date(),
        }),
      );
      const session = await sessions.save(
        sessions.create({
          userId: user.id,
          secretHash: hashCharacter.repeat(64),
          csrfHash: hashCharacter.toUpperCase().repeat(64),
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
          lastSeenAt: null,
          ipAddress: null,
          userAgent: null,
          activeOrganizationId: null,
        }),
      );
      return { user, session };
    };
    const [actorA, actorB] = await Promise.all([
      actor('a', 'a'),
      actor('b', 'b'),
    ]);
    const organizations = harness.dataSource.getRepository(Organization);
    const memberships = harness.dataSource.getRepository(Membership);
    const controller = (authenticated: typeof actorA) =>
      new OrganizationsController(
        harness.dataSource,
        {
          authenticate: jest.fn().mockResolvedValue(authenticated),
        } as unknown as IdentityService,
        new OrganizationAccessService(organizations, memberships),
        { trialDays: 7 },
        organizations,
        memberships,
        harness.dataSource.getRepository(Invitation),
        users,
        { enqueue: jest.fn() },
      );
    const request = { headers: {} } as Request;

    const results = await Promise.allSettled([
      controller(actorA).create(
        { name: 'North Design', slug: 'concurrent-design' },
        request,
      ),
      controller(actorB).create(
        { name: 'Other Name', slug: 'concurrent-design' },
        request,
      ),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(rejected?.reason).toBeInstanceOf(BadRequestException);
    if (!(rejected?.reason instanceof BadRequestException)) {
      throw new Error('Expected the losing slug request to return HTTP 400.');
    }
    const response = rejected.reason.getResponse();
    if (
      typeof response !== 'object' ||
      response === null ||
      !('statusCode' in response) ||
      !('message' in response)
    ) {
      throw new Error('Expected a structured HTTP 400 response.');
    }
    expect(response.statusCode).toBe(400);
    if (typeof response.message !== 'string') {
      throw new Error('Expected a safe slug conflict message.');
    }
    expect(response.message).toMatch(/slug.*uso/iu);

    const organization = await organizations.findOneByOrFail({
      slug: 'concurrent-design',
    });
    await expect(organizations.count()).resolves.toBe(1);
    await expect(
      memberships.countBy({ organizationId: organization.id }),
    ).resolves.toBe(1);
    await expect(
      harness.dataSource.getRepository(Subscription).countBy({
        organizationId: organization.id,
        tenantId: organization.id,
      }),
    ).resolves.toBe(1);
    await expect(
      harness.dataSource.getRepository(PlanCatalog).countBy({
        code: 'standalone-trial',
      }),
    ).resolves.toBe(1);
    await expect(
      harness.dataSource.getRepository(PlanEntitlement).countBy({
        planCode: 'standalone-trial',
        entitlementCode: 'design.cad',
      }),
    ).resolves.toBe(1);
    const actorSessions = await Promise.all([
      sessions.findOneByOrFail({ id: actorA.session.id }),
      sessions.findOneByOrFail({ id: actorB.session.id }),
    ]);
    expect(
      actorSessions.filter(
        (candidate) => candidate.activeOrganizationId === organization.id,
      ),
    ).toHaveLength(1);

    const winningActor = results[0].status === 'fulfilled' ? actorA : actorB;
    try {
      await controller(winningActor).create(
        { name: 'Second Trial', slug: 'second-owner-trial' },
        request,
      );
      throw new Error('Expected a second owner trial to be rejected.');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      if (!(error instanceof ConflictException)) throw error;
      expect(error.getResponse()).toMatchObject({
        code: 'trial_already_granted',
      });
    }
    await expect(organizations.count()).resolves.toBe(1);
  });
});
