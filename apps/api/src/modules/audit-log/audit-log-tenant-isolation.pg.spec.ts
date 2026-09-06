import { NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import type { Repository } from 'typeorm';
import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import { User } from '../identity/entities/identity.entity';
import type { IdentityService } from '../identity/identity.service';
import { OrganizationAccessService } from '../organizations/organization-access.service';
import {
  Invitation,
  Membership,
  Organization,
} from '../organizations/entities/organization.entity';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { createTenantScopedRepository } from '../../common/tenant/tenant-scoped.repository';
import { AuditLogController } from './audit-log.controller';
import { AuditLogRetentionService } from './audit-log-retention.service';
import { DesignAuditLog } from './design-audit-log.service';
import { DesignAuditLogEntry } from './entities/design-audit-log.entity';

/**
 * T-62(a) — LA BITÁCORA QUE SE ESCRIBÍA Y NADIE PODÍA LEER, contra
 * PostgreSQL real.
 *
 * Lo que hay que probar aquí NO es que `DesignAuditLog.recent()` filtre por
 * tenant — eso ya lo prueba `design-audit-log.pg.spec.ts` desde Fase 3. Es
 * que el CONTROLADOR resuelve el tenant correcto a partir del
 * `:organizationId` de la URL (verificado contra la membresía real), no de
 * la sesión activa: alguien con dos organizaciones tiene que poder leer la
 * bitácora de la que NO tiene activa ahora mismo, y jamás la de una
 * organización a la que no pertenece, aunque adivine el UUID.
 */
describePostgres(
  'Bitácora de auditoría: lectura y purga (PostgreSQL real)',
  () => {
    jest.setTimeout(60_000);

    let harness: PostgresHarness;
    let users: Repository<User>;
    let organizations: Repository<Organization>;
    let memberships: Repository<Membership>;
    let auditEntries: Repository<DesignAuditLogEntry>;
    let retention: AuditLogRetentionService;

    beforeAll(async () => {
      harness = await createPostgresHarness(
        [User, Organization, Membership, Invitation, DesignAuditLogEntry],
        { schemaPrefix: 'audit_log_tenant' },
      );
      users = harness.dataSource.getRepository(User);
      organizations = harness.dataSource.getRepository(Organization);
      memberships = harness.dataSource.getRepository(Membership);
      auditEntries = harness.dataSource.getRepository(DesignAuditLogEntry);
      retention = new AuditLogRetentionService(auditEntries);
    });

    afterAll(async () => {
      if (harness) await harness.destroy();
    });

    beforeEach(async () => {
      await harness.truncateAll();
    });

    async function actor() {
      const user = await users.save(
        users.create({
          email: `member-${randomUUID()}@example.test`,
          displayName: 'Miembro',
          emailVerifiedAt: new Date(),
        }),
      );
      return { user };
    }

    async function organizacionCon(userId: string, role: 'owner' | 'member') {
      const organization = await organizations.save(
        organizations.create({
          name: `Despacho ${randomUUID()}`,
          slug: `despacho-${randomUUID()}`,
          ownerUserId: userId,
        }),
      );
      await memberships.save(
        memberships.create({
          organizationId: organization.id,
          userId,
          role,
        }),
      );
      return organization;
    }

    /** Un controlador con SU PROPIO contexto de tenant, para el usuario dado. */
    function controllerFor(user: User): AuditLogController {
      const tenantContext = new TenantContextService();
      const auditLog = new DesignAuditLog(
        createTenantScopedRepository(
          DesignAuditLogEntry,
          harness.dataSource.manager,
          tenantContext,
          { strict: true },
        ),
        tenantContext,
      );
      return new AuditLogController(
        {
          authenticate: jest
            .fn()
            .mockResolvedValue({ user, session: { id: randomUUID() } }),
        } as unknown as IdentityService,
        new OrganizationAccessService(organizations, memberships),
        auditLog,
        tenantContext,
      );
    }

    const request = { headers: {} } as Request;

    it('un miembro lee sólo los asientos de SU organización, aunque tenga otra activa', async () => {
      const { user: ownerA } = await actor();
      const orgA = await organizacionCon(ownerA.id, 'owner');
      const { user: ownerB } = await actor();
      const orgB = await organizacionCon(ownerB.id, 'owner');

      await auditEntries.save(
        auditEntries.create({
          tenantId: orgA.id,
          actor: 'a@example.test',
          action: 'cad_document_saved',
          referenceType: 'CAD_DOCUMENT',
          referenceId: randomUUID(),
        }),
      );
      await auditEntries.save(
        auditEntries.create({
          tenantId: orgB.id,
          actor: 'b@example.test',
          action: 'cad_document_saved',
          referenceType: 'CAD_DOCUMENT',
          referenceId: randomUUID(),
        }),
      );

      const result = await controllerFor(ownerA).list(
        orgA.id,
        undefined,
        request,
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].actor).toBe('a@example.test');
    });

    it('quien no es miembro no puede leer la bitácora, aunque acierte el UUID', async () => {
      const { user: owner } = await actor();
      const org = await organizacionCon(owner.id, 'owner');
      const { user: outsider } = await actor();

      await auditEntries.save(
        auditEntries.create({
          tenantId: org.id,
          actor: owner.email,
          action: 'cad_document_saved',
        }),
      );

      await expect(
        controllerFor(outsider).list(org.id, undefined, request),
      ).rejects.toThrow(NotFoundException);
    });

    it('un miembro sin rol de propietario también puede leer (no es una ruta de sólo-owner)', async () => {
      const { user: owner } = await actor();
      const org = await organizacionCon(owner.id, 'owner');
      const { user: member } = await actor();
      await memberships.save(
        memberships.create({
          organizationId: org.id,
          userId: member.id,
          role: 'member',
        }),
      );
      await auditEntries.save(
        auditEntries.create({
          tenantId: org.id,
          actor: owner.email,
          action: 'cad_document_saved',
        }),
      );

      const result = await controllerFor(member).list(
        org.id,
        undefined,
        request,
      );
      expect(result.items).toHaveLength(1);
    });

    it('la purga borra los asientos más viejos que la retención, de CUALQUIER tenant, y conserva los recientes', async () => {
      const { user: owner } = await actor();
      const org = await organizacionCon(owner.id, 'owner');

      const viejo = await auditEntries.save(
        auditEntries.create({
          tenantId: org.id,
          actor: owner.email,
          action: 'cad_document_saved',
        }),
      );
      const reciente = await auditEntries.save(
        auditEntries.create({
          tenantId: org.id,
          actor: owner.email,
          action: 'cad_document_saved',
        }),
      );
      // Empuja el asiento "viejo" fuera de la ventana de retención sin esperar
      // 400 días de verdad.
      await auditEntries.update(viejo.id, {
        createdAt: new Date(Date.now() - 401 * 24 * 60 * 60_000),
      });

      const deleted = await retention.purgeOlderThan(400);

      expect(deleted).toBe(1);
      await expect(
        auditEntries.findOneBy({ id: viejo.id }),
      ).resolves.toBeNull();
      await expect(
        auditEntries.findOneBy({ id: reciente.id }),
      ).resolves.not.toBeNull();
    });
  },
);
