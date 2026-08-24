import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.types';
import { User } from '../identity/entities/identity.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { PostgresCadEventPublisher } from './adapters/postgres.adapters';
import { NullPaymentProvider } from './adapters/null-payment.provider';
import { CommercialController } from './controllers/commercial.controller';
import {
  DomainOutbox,
  PlanCatalog,
  PlanEntitlement,
  PlanPrice,
  Subscription,
  SubscriptionUpgradeIntent,
} from './entities/commercial.entities';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

/**
 * Checkout sin pasarela contra PostgreSQL real. Lo que se demuestra aquí no
 * cabe en SQLite ni en mocks: el índice único parcial que arbitra dos intents
 * `pending` concurrentes y la decisión atómica `pending`→decidido bajo
 * carrera (cancelación).
 *
 * `confirmUpgradeIntent` está RETIRADO (P0-A, campaña de seguridad
 * 2026-08-23): `organizationId` siempre se deriva de la membresía activa de
 * quien llama, así que el único principal que podía alcanzar la confirmación
 * era un owner/admin de la MISMA organización cliente que pidió el upgrade —
 * exactamente el actor que jamás debe poder concederse a sí mismo un plan
 * pagado sin pasar por el proveedor de pagos. Las pruebas de esta suite lo
 * verifican: ningún rol, de ninguna organización, muta nada al intentarlo.
 */
describePostgres('CommercialController upgrade intents (PostgreSQL)', () => {
  jest.setTimeout(60_000);

  let harness: PostgresHarness;
  let controller: CommercialController;
  let organizationId: string;
  let ownerId: string;
  let memberId: string;

  beforeAll(async () => {
    harness = await createPostgresHarness(
      [
        User,
        Organization,
        PlanCatalog,
        PlanEntitlement,
        PlanPrice,
        Subscription,
        SubscriptionUpgradeIntent,
        DomainOutbox,
      ],
      { schemaPrefix: 'upgrade_intents' },
    );
    const source = harness.dataSource;
    controller = new CommercialController(
      source.getRepository(Subscription),
      source.getRepository(PlanCatalog),
      source.getRepository(PlanEntitlement),
      source.getRepository(PlanPrice),
      source.getRepository(SubscriptionUpgradeIntent),
      source,
      new SubscriptionLifecycleService(source, new PostgresCadEventPublisher()),
      new PostgresCadEventPublisher(),
      new NullPaymentProvider(),
    );
  });

  afterAll(async () => {
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    await harness.truncateAll();
    const users = harness.dataSource.getRepository(User);
    const owner = await users.save(
      users.create({
        email: `upgrade-owner-${randomUUID()}@example.test`,
        displayName: 'Upgrade owner',
        emailVerifiedAt: new Date(),
      }),
    );
    ownerId = owner.id;
    memberId = (
      await users.save(
        users.create({
          email: `upgrade-member-${randomUUID()}@example.test`,
          displayName: 'Upgrade member',
          emailVerifiedAt: new Date(),
        }),
      )
    ).id;
    const organizations = harness.dataSource.getRepository(Organization);
    organizationId = (
      await organizations.save(
        organizations.create({
          name: 'Upgrade organization',
          slug: `upgrade-${randomUUID()}`,
          ownerUserId: owner.id,
        }),
      )
    ).id;
    const plans = harness.dataSource.getRepository(PlanCatalog);
    await plans.save([
      { code: 'standalone-trial', active: true, metadata: { kind: 'trial' } },
      { code: 'standalone-full', active: true, metadata: { kind: 'paid' } },
    ]);
    await harness.dataSource.getRepository(Subscription).save({
      organizationId,
      tenantId: organizationId,
      planCode: 'standalone-trial',
      status: 'trialing',
      trialEndsAt: new Date(Date.now() + 86_400_000),
    });
  });

  function request(
    role: string,
    userId: string,
    organization: string | null = organizationId,
  ): Request {
    const user: AuthenticatedUser = {
      userId,
      email: 'never-used-in-views@example.test',
      role,
      tenant_id: organization,
      organization_id: organization,
      plant_id: null,
      permissions: null,
      scopes: null,
    };
    return { user } as unknown as Request;
  }

  it('registra, lista y cancela; NINGÚN rol de la organización cliente puede confirmar (P0-A)', async () => {
    const created = await controller.createUpgradeIntent(
      { requestedPlanCode: 'standalone-full' },
      request('member', memberId),
    );
    expect(created).toMatchObject({
      status: 'pending',
      requestedPlanCode: 'standalone-full',
      requestedByUserId: memberId,
      decidedByUserId: null,
      decidedAt: null,
    });

    // Un member no decide ni audita la lista; owner sí (sin cambios).
    expect(() =>
      controller.confirmUpgradeIntent(created.id, request('member', memberId)),
    ).toThrow(ForbiddenException);
    await expect(
      controller.listUpgradeIntents(request('viewer', memberId)),
    ).rejects.toThrow(ForbiddenException);

    // El propio owner de la organización cliente TAMBIÉN es rechazado: es
    // exactamente el actor que P0-A cierra. Nada muta.
    expect(() =>
      controller.confirmUpgradeIntent(created.id, request('owner', ownerId)),
    ).toThrow(ForbiddenException);
    await expect(
      harness.dataSource
        .getRepository(SubscriptionUpgradeIntent)
        .findOneByOrFail({ id: created.id }),
    ).resolves.toMatchObject({
      status: 'pending',
      decidedByUserId: null,
      decidedAt: null,
    });
    await expect(
      harness.dataSource
        .getRepository(Subscription)
        .findOneByOrFail({ organizationId }),
    ).resolves.toMatchObject({
      planCode: 'standalone-trial',
      status: 'trialing',
    });
    await expect(
      harness.dataSource.getRepository(DomainOutbox).count(),
    ).resolves.toBe(0);

    // Cancelar SÍ sigue siendo un camino legítimo del owner/admin: no otorga
    // acceso, sólo cierra la solicitud.
    const cancelled = await controller.cancelUpgradeIntent(
      created.id,
      request('owner', ownerId),
    );
    expect(cancelled).toMatchObject({ status: 'cancelled' });

    // Ya decidido (cancelado): ni confirmar ni volver a cancelar.
    expect(() =>
      controller.confirmUpgradeIntent(created.id, request('owner', ownerId)),
    ).toThrow(ForbiddenException);
    await expect(
      controller.cancelUpgradeIntent(created.id, request('owner', ownerId)),
    ).rejects.toThrow(ConflictException);

    const listed = await controller.listUpgradeIntents(
      request('admin', ownerId),
    );
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({ status: 'cancelled' });
  });

  it('confirmar no muta nada incluso con un intent válido y el plan pedido activo', async () => {
    const created = await controller.createUpgradeIntent(
      { requestedPlanCode: 'standalone-full' },
      request('owner', ownerId),
    );

    expect(() =>
      controller.confirmUpgradeIntent(created.id, request('owner', ownerId)),
    ).toThrow(ForbiddenException);
    expect(() =>
      controller.confirmUpgradeIntent(created.id, request('admin', ownerId)),
    ).toThrow(ForbiddenException);

    await expect(
      harness.dataSource
        .getRepository(SubscriptionUpgradeIntent)
        .findOneByOrFail({ id: created.id }),
    ).resolves.toMatchObject({ status: 'pending', decidedAt: null });
    await expect(
      harness.dataSource
        .getRepository(Subscription)
        .findOneByOrFail({ organizationId }),
    ).resolves.toMatchObject({ planCode: 'standalone-trial' });
    await expect(
      harness.dataSource.getRepository(DomainOutbox).count(),
    ).resolves.toBe(0);
  });

  it('dos registros concurrentes dejan exactamente un pending (índice parcial)', async () => {
    const attempts = await Promise.allSettled([
      controller.createUpgradeIntent(
        { requestedPlanCode: 'standalone-full' },
        request('owner', ownerId),
      ),
      controller.createUpgradeIntent(
        { requestedPlanCode: 'standalone-full' },
        request('member', memberId),
      ),
    ]);
    const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
    const rejected = attempts.filter(
      (a): a is PromiseRejectedResult => a.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    await expect(
      harness.dataSource
        .getRepository(SubscriptionUpgradeIntent)
        .countBy({ organizationId, status: 'pending' }),
    ).resolves.toBe(1);

    // Cancelado el pending, se puede registrar otro: el índice es parcial.
    const pending = await harness.dataSource
      .getRepository(SubscriptionUpgradeIntent)
      .findOneByOrFail({ organizationId, status: 'pending' });
    await controller.cancelUpgradeIntent(pending.id, request('owner', ownerId));
    await expect(
      controller.createUpgradeIntent(
        { requestedPlanCode: 'standalone-full' },
        request('owner', ownerId),
      ),
    ).resolves.toMatchObject({ status: 'pending' });
  });

  it('rechaza planes no vendibles: inexistentes, inactivos o de trial', async () => {
    await expect(
      controller.createUpgradeIntent(
        { requestedPlanCode: 'no-existe' },
        request('owner', ownerId),
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      controller.createUpgradeIntent(
        { requestedPlanCode: 'standalone-trial' },
        request('owner', ownerId),
      ),
    ).rejects.toThrow(BadRequestException);

    await harness.dataSource
      .getRepository(PlanCatalog)
      .update({ code: 'standalone-full' }, { active: false });
    await expect(
      controller.createUpgradeIntent(
        { requestedPlanCode: 'standalone-full' },
        request('owner', ownerId),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('un plan desactivado no cambia el resultado: sigue siendo Forbidden, no un 409 de plan', async () => {
    const created = await controller.createUpgradeIntent(
      { requestedPlanCode: 'standalone-full' },
      request('owner', ownerId),
    );
    await harness.dataSource
      .getRepository(PlanCatalog)
      .update({ code: 'standalone-full' }, { active: false });

    // Antes de P0-A esto habría sido un 409 `plan_unavailable` (la
    // confirmación llegaba a mirar el plan). Ahora la autorización se decide
    // ANTES de tocar cualquier repositorio: sigue siendo el mismo 403.
    expect(() =>
      controller.confirmUpgradeIntent(created.id, request('owner', ownerId)),
    ).toThrow(ForbiddenException);

    await expect(
      harness.dataSource
        .getRepository(SubscriptionUpgradeIntent)
        .findOneByOrFail({ id: created.id }),
    ).resolves.toMatchObject({ status: 'pending', decidedAt: null });
    await expect(
      harness.dataSource
        .getRepository(Subscription)
        .findOneByOrFail({ organizationId }),
    ).resolves.toMatchObject({ planCode: 'standalone-trial' });
    await expect(
      harness.dataSource.getRepository(DomainOutbox).count(),
    ).resolves.toBe(0);
  });

  it('un intent de otra organización también recibe Forbidden, no una filtración de 404 vs 403', async () => {
    const created = await controller.createUpgradeIntent(
      { requestedPlanCode: 'standalone-full' },
      request('owner', ownerId),
    );
    const users = harness.dataSource.getRepository(User);
    const otherOwner = await users.save(
      users.create({
        email: `other-${randomUUID()}@example.test`,
        displayName: 'Other owner',
        emailVerifiedAt: new Date(),
      }),
    );
    const organizations = harness.dataSource.getRepository(Organization);
    const otherOrganization = await organizations.save(
      organizations.create({
        name: 'Other organization',
        slug: `other-${randomUUID()}`,
        ownerUserId: otherOwner.id,
      }),
    );
    // La ruta está retirada para TODOS: ni siquiera se llega a comprobar si
    // el intent es de otra organización. Fail-closed sin necesidad de una
    // consulta cross-tenant (ADR-0005 la habría exigido no-enumerativa de
    // todas formas).
    expect(() =>
      controller.confirmUpgradeIntent(
        created.id,
        request('owner', otherOwner.id, otherOrganization.id),
      ),
    ).toThrow(ForbiddenException);
    await expect(
      harness.dataSource
        .getRepository(SubscriptionUpgradeIntent)
        .findOneByOrFail({ id: created.id }),
    ).resolves.toMatchObject({ status: 'pending' });
  });

  it('la lectura comercial asienta el trial vencido (evaluación perezosa)', async () => {
    await harness.dataSource
      .getRepository(Subscription)
      .update(
        { organizationId },
        { trialEndsAt: new Date(Date.now() - 60_000) },
      );

    const snapshot = await controller.subscription(request('owner', ownerId));
    expect(snapshot.subscription).toMatchObject({
      status: 'suspended',
      effective: false,
    });
    await expect(
      harness.dataSource
        .getRepository(Subscription)
        .findOneByOrFail({ organizationId }),
    ).resolves.toMatchObject({ status: 'suspended' });

    // La reactivación real llega por el webhook del proveedor de pagos
    // (`BillingWebhookService`), no por un confirm manual (P0-A: esa ruta
    // está retirada). Se simula aquí escribiendo directamente lo que el
    // webhook escribiría: plan, `active` Y un `currentPeriodEnd` vigente
    // (P0-B: `active` solo ya no basta, ver commercial-entitlement-period).
    await harness.dataSource.getRepository(Subscription).update(
      { organizationId },
      {
        planCode: 'standalone-full',
        status: 'active',
        trialEndsAt: null,
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    );
    const after = await controller.subscription(request('owner', ownerId));
    expect(after.subscription).toMatchObject({
      planCode: 'standalone-full',
      status: 'active',
      effective: true,
    });
  });
});
