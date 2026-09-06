import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import type { Repository } from 'typeorm';
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
import { SeatEntitlementService } from '../commercial/seat-entitlement.service';
import { Session, User } from '../identity/entities/identity.entity';
import type { IdentityService } from '../identity/identity.service';
import { OrganizationAccessService } from './organization-access.service';
import {
  Invitation,
  Membership,
  Organization,
  type OrganizationRole,
} from './entities/organization.entity';
import { OrganizationsController } from './organizations.controller';

/**
 * T-60a — LOS CUATRO AGUJEROS DE ADMINISTRACIÓN, la mitad de expulsar y
 * degradar. Antes de esta ficha, sobre TODO el API había 17 rutas
 * `@Delete`/`@Patch`/`@Put` y ninguna era de organizaciones: no existía forma
 * de echar a nadie ni de cambiarle el rol. Contra PostgreSQL real porque el
 * límite que importa —"el propietario no se puede tocar", "un admin no
 * puede tocar a otro admin", "nadie se expulsa a sí mismo"— es exactamente
 * la clase de invariante que una prueba con SQLite en memoria no ejercita
 * igual (aislamiento de sesión, índices únicos reales).
 */
describePostgres(
  'Membresías: expulsar y cambiar de rol (PostgreSQL real)',
  () => {
    jest.setTimeout(60_000);

    let harness: PostgresHarness;
    let users: Repository<User>;
    let sessions: Repository<Session>;
    let organizations: Repository<Organization>;
    let memberships: Repository<Membership>;

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
        { schemaPrefix: 'organization_memberships' },
      );
      users = harness.dataSource.getRepository(User);
      sessions = harness.dataSource.getRepository(Session);
      organizations = harness.dataSource.getRepository(Organization);
      memberships = harness.dataSource.getRepository(Membership);
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

    /** Un usuario con sesión, listo para pasar a `authenticate`. */
    async function actor(label: string) {
      const user = await users.save(
        users.create({
          email: `member-${label}-${randomUUID()}@example.test`,
          displayName: `Miembro ${label}`,
          emailVerifiedAt: new Date(),
        }),
      );
      const session = await sessions.save(
        sessions.create({
          userId: user.id,
          secretHash: 'a'.repeat(64),
          csrfHash: 'A'.repeat(64),
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
          lastSeenAt: null,
          ipAddress: null,
          userAgent: null,
          activeOrganizationId: null,
        }),
      );
      return { user, session };
    }

    function controllerFor(authenticated: {
      user: User;
      session: Session;
    }): OrganizationsController {
      return new OrganizationsController(
        harness.dataSource,
        {
          authenticate: jest.fn().mockResolvedValue(authenticated),
        } as unknown as IdentityService,
        new OrganizationAccessService(organizations, memberships),
        { trialDays: 7 },
        new SeatEntitlementService(harness.dataSource),
        organizations,
        memberships,
        harness.dataSource.getRepository(Invitation),
        users,
        { enqueue: jest.fn() },
      );
    }

    const request = { headers: {} } as Request;

    /** Organización con dueño + un segundo miembro en el rol que se pida. */
    async function organizacionConMiembro(role: OrganizationRole) {
      const owner = await actor('owner');
      const created = await controllerFor(owner).create(
        { name: `Despacho ${randomUUID()}`, slug: `despacho-${randomUUID()}` },
        request,
      );
      const colleague = await actor('colleague');
      const membership = await memberships.save(
        memberships.create({
          organizationId: created.id,
          userId: colleague.user.id,
          role,
        }),
      );
      return { owner, colleague, organizationId: created.id, membership };
    }

    it('el propietario expulsa a un miembro y limpia su organización activa', async () => {
      const { owner, colleague, organizationId, membership } =
        await organizacionConMiembro('member');
      // La sesión del expulsado apuntaba a ESTA organización.
      await sessions.update(colleague.session.id, {
        activeOrganizationId: organizationId,
      });

      await controllerFor(owner).removeMember(
        organizationId,
        membership.id,
        request,
      );

      await expect(
        memberships.findOneBy({ id: membership.id }),
      ).resolves.toBeNull();
      const refreshedSession = await sessions.findOneByOrFail({
        id: colleague.session.id,
      });
      expect(refreshedSession.activeOrganizationId).toBeNull();
    });

    it('expulsar no revoca sesiones de OTRAS organizaciones de la misma persona', async () => {
      const { owner, colleague, organizationId, membership } =
        await organizacionConMiembro('member');
      const otraOrganizacionId = randomUUID();
      await sessions.update(colleague.session.id, {
        activeOrganizationId: otraOrganizacionId,
      });

      await controllerFor(owner).removeMember(
        organizationId,
        membership.id,
        request,
      );

      const refreshedSession = await sessions.findOneByOrFail({
        id: colleague.session.id,
      });
      expect(refreshedSession.activeOrganizationId).toBe(otraOrganizacionId);
    });

    it('el propietario degrada el rol de un admin a viewer', async () => {
      const { owner, organizationId, membership } =
        await organizacionConMiembro('admin');

      const result = await controllerFor(owner).changeMemberRole(
        organizationId,
        membership.id,
        { role: 'viewer' },
        request,
      );

      expect(result).toMatchObject({ id: membership.id, role: 'viewer' });
      await expect(
        memberships.findOneByOrFail({ id: membership.id }),
      ).resolves.toMatchObject({ role: 'viewer' });
    });

    it('un admin puede expulsar a un member, pero no a otro admin', async () => {
      const owner = await actor('owner');
      const created = await controllerFor(owner).create(
        { name: `Despacho ${randomUUID()}`, slug: `despacho-${randomUUID()}` },
        request,
      );
      const adminA = await actor('admin-a');
      await memberships.save(
        memberships.create({
          organizationId: created.id,
          userId: adminA.user.id,
          role: 'admin',
        }),
      );
      const adminB = await actor('admin-b');
      const adminBMembership = await memberships.save(
        memberships.create({
          organizationId: created.id,
          userId: adminB.user.id,
          role: 'admin',
        }),
      );
      const member = await actor('member');
      const memberMembership = await memberships.save(
        memberships.create({
          organizationId: created.id,
          userId: member.user.id,
          role: 'member',
        }),
      );

      // adminA SÍ puede expulsar al member.
      await controllerFor(adminA).removeMember(
        created.id,
        memberMembership.id,
        request,
      );
      await expect(
        memberships.findOneBy({ id: memberMembership.id }),
      ).resolves.toBeNull();

      // adminA NO puede tocar a adminB — sólo el propietario tiene ese alcance.
      await expect(
        controllerFor(adminA).removeMember(
          created.id,
          adminBMembership.id,
          request,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        controllerFor(adminA).changeMemberRole(
          created.id,
          adminBMembership.id,
          { role: 'member' },
          request,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('el propietario no se puede tocar ni expulsar por esta vía', async () => {
      const owner = await actor('owner');
      const created = await controllerFor(owner).create(
        { name: `Despacho ${randomUUID()}`, slug: `despacho-${randomUUID()}` },
        request,
      );
      const ownerMembership = await memberships.findOneByOrFail({
        organizationId: created.id,
        userId: owner.user.id,
      });

      const expectOwnerProtected = async (promise: Promise<unknown>) => {
        let caught: unknown;
        try {
          await promise;
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeInstanceOf(ForbiddenException);
        const response = (caught as ForbiddenException).getResponse();
        expect(
          typeof response === 'object' && response !== null
            ? (response as { code?: unknown }).code
            : undefined,
        ).toBe('organization_owner_protected');
      };

      await expectOwnerProtected(
        controllerFor(owner).removeMember(
          created.id,
          ownerMembership.id,
          request,
        ),
      );
      await expectOwnerProtected(
        controllerFor(owner).changeMemberRole(
          created.id,
          ownerMembership.id,
          { role: 'admin' },
          request,
        ),
      );
    });

    it('nadie se expulsa ni se cambia el rol a sí mismo por esta vía', async () => {
      const { owner, organizationId } = await organizacionConMiembro('admin');
      const ownerMembership = await memberships.findOneByOrFail({
        organizationId,
        userId: owner.user.id,
      });

      await expect(
        controllerFor(owner).removeMember(
          organizationId,
          ownerMembership.id,
          request,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un miembro sin rol de administración no puede expulsar ni cambiar roles', async () => {
      const { colleague, organizationId, membership } =
        await organizacionConMiembro('member');
      const viewer = await actor('viewer');
      const viewerMembership = await memberships.save(
        memberships.create({
          organizationId,
          userId: viewer.user.id,
          role: 'viewer',
        }),
      );

      await expect(
        controllerFor(colleague).removeMember(
          organizationId,
          viewerMembership.id,
          request,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      // El propio colleague tampoco puede actuar sobre sí mismo aunque
      // encontrara su membresía.
      await expect(
        controllerFor(colleague).changeMemberRole(
          organizationId,
          membership.id,
          { role: 'admin' },
          request,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('una membresía de OTRA organización devuelve 404 (aislamiento por tenant)', async () => {
      const { owner: ownerA } = await organizacionConMiembro('member');
      const { organizationId: organizationB, membership: membershipB } =
        await organizacionConMiembro('member');

      // ownerA es dueño de una organización distinta de B: no puede tocar la
      // membresía de B aunque sea owner en la suya.
      await expect(
        controllerFor(ownerA).removeMember(
          organizationB,
          membershipB.id,
          request,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  },
);
