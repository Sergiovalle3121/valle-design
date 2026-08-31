import { randomBytes } from 'node:crypto';
import type { DataSource } from 'typeorm';
import {
  DomainOutbox,
  EmailOutbox,
  PlanCatalog,
  PlanEntitlement,
  PlanPrice,
  Subscription,
  type SubscriptionStatus,
  SubscriptionUpgradeIntent,
  UsageLedger,
} from '../../modules/commercial/entities/commercial.entities';
import {
  Credential,
  IdentityAuditEvent,
  OneTimeToken,
  Session,
  User,
} from '../../modules/identity/entities/identity.entity';
import { hashOpaqueToken } from '../../modules/identity/identity-security';
import {
  Invitation,
  Membership,
  Organization,
  type OrganizationRole,
} from '../../modules/organizations/entities/organization.entity';

const TEST_PLAN_CODE = 'cad-first-party-test';
const DESIGN_CAD_ENTITLEMENT = 'design.cad';

/**
 * Complete first-party relation graph required by TypeORM test data sources.
 * Keeping it here prevents a test from hiding a missing production relation by
 * registering only the entity it happens to query directly.
 */
export const FIRST_PARTY_AUTH_ENTITY_GRAPH = [
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
] as const;

export interface FirstPartyCadActor {
  userId: string;
  email: string;
  organizationId: string | null;
  sessionId: string;
  csrfToken: string;
  /** Supertest-compatible headers. CSRF is harmless on safe methods. */
  headers: Readonly<Record<string, string>>;
}

export interface SeedFirstPartyCadActorOptions {
  email: string;
  role?: OrganizationRole;
  organizationName?: string;
  withOrganization?: boolean;
  withMembership?: boolean;
  entitled?: boolean;
  subscriptionStatus?: SubscriptionStatus;
  trialEndsAt?: Date | null;
  /**
   * Defaults to 30 days in the future so `subscriptionStatus: 'active'`
   * (the default) seeds a genuinely current subscription. Tests that need
   * to exercise a lapsed/absent period must pass this explicitly.
   */
  currentPeriodEnd?: Date | null;
  /** Allows a stale active organization to be exercised without membership. */
  activeOrganization?: 'organization' | 'none';
  /**
   * Joins an EXISTING organization (by id) instead of creating a new one —
   * for tests that need a second/third teammate sharing the same tenant
   * (e.g. a direct-message channel between two members). The entitlement is
   * assumed already seeded by whoever created the organization first;
   * `entitled`/`subscriptionStatus`/`trialEndsAt`/`currentPeriodEnd` are
   * ignored in this mode. `role` defaults to `member` (the org already has
   * its `owner`).
   */
  organizationId?: string;
}

/**
 * Seeds exactly the state consumed by CadAuthGuard and PermissionsGuard. Roles,
 * permissions and tenant are never placed in the client-controlled headers.
 */
export async function seedFirstPartyCadActor(
  dataSource: DataSource,
  options: SeedFirstPartyCadActorOptions,
): Promise<FirstPartyCadActor> {
  const withOrganization = options.withOrganization ?? true;
  const withMembership = options.withMembership ?? withOrganization;
  const entitled = options.entitled ?? withOrganization;
  const normalizedEmail = options.email.trim().toLowerCase();

  const user = await dataSource.getRepository(User).save({
    email: normalizedEmail,
    displayName: 'CAD test actor',
    emailVerifiedAt: new Date(),
  });

  let organization: Organization | null = null;
  if (options.organizationId) {
    // Segundo/tercer compañero del MISMO tenant (p. ej. mensaje directo entre
    // dos miembros): la organización y su entitlement ya los sembró quien la
    // creó primero — aquí sólo se añade la membresía.
    organization = await dataSource
      .getRepository(Organization)
      .findOneByOrFail({ id: options.organizationId });
    if (withMembership) {
      await dataSource.getRepository(Membership).save({
        organizationId: organization.id,
        userId: user.id,
        role: options.role ?? 'member',
      });
    }
  } else if (withOrganization) {
    const slugSuffix = randomBytes(8).toString('hex');
    organization = await dataSource.getRepository(Organization).save({
      name: options.organizationName ?? `CAD test ${slugSuffix}`,
      slug: `cad-test-${slugSuffix}`,
      ownerUserId: user.id,
    });

    if (withMembership) {
      await dataSource.getRepository(Membership).save({
        organizationId: organization.id,
        userId: user.id,
        role: options.role ?? 'owner',
      });
    }

    if (entitled) {
      await ensureCadPlan(dataSource);
      await dataSource.getRepository(Subscription).save({
        organizationId: organization.id,
        tenantId: organization.id,
        planCode: TEST_PLAN_CODE,
        status: options.subscriptionStatus ?? 'active',
        trialEndsAt: options.trialEndsAt ?? null,
        currentPeriodEnd:
          options.currentPeriodEnd ?? new Date(Date.now() + 30 * 86_400_000),
      });
    }
  }

  const secret = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const activeOrganizationId =
    options.activeOrganization === 'none' ? null : (organization?.id ?? null);
  const session = await dataSource.getRepository(Session).save({
    userId: user.id,
    secretHash: hashOpaqueToken(secret),
    csrfHash: hashOpaqueToken(csrfToken),
    expiresAt: new Date(Date.now() + 60 * 60_000),
    revokedAt: null,
    lastSeenAt: null,
    ipAddress: '127.0.0.1',
    userAgent: 'first-party-cad-auth-test',
    activeOrganizationId,
  });

  return {
    userId: user.id,
    email: user.email,
    organizationId: organization?.id ?? null,
    sessionId: session.id,
    csrfToken,
    headers: {
      Cookie: `valle_session=${session.id}.${secret}; valle_csrf=${csrfToken}`,
      'X-CSRF-Token': csrfToken,
    },
  };
}

async function ensureCadPlan(dataSource: DataSource): Promise<void> {
  const plans = dataSource.getRepository(PlanCatalog);
  if (!(await plans.findOneBy({ code: TEST_PLAN_CODE }))) {
    await plans.save({
      code: TEST_PLAN_CODE,
      active: true,
      metadata: null,
    });
  }

  const entitlements = dataSource.getRepository(PlanEntitlement);
  if (
    !(await entitlements.findOneBy({
      planCode: TEST_PLAN_CODE,
      entitlementCode: DESIGN_CAD_ENTITLEMENT,
    }))
  ) {
    await entitlements.save({
      planCode: TEST_PLAN_CODE,
      entitlementCode: DESIGN_CAD_ENTITLEMENT,
    });
  }
}
