import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
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
 * `pending` concurrentes, la decisión atómica `pending`→decidido bajo carrera
 * y que un confirm fallido (plan desactivado) deshace TAMBIÉN la decisión del
 * intent porque comparten transacción.
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

  it('registra, lista, confirma y refleja el upgrade en la suscripción', async () => {
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

    // Un member no decide ni audita la lista; owner sí.
    await expect(
      controller.confirmUpgradeIntent(created.id, request('member', memberId)),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.listUpgradeIntents(request('viewer', memberId)),
    ).rejects.toThrow(ForbiddenException);

    const confirmed = await controller.confirmUpgradeIntent(
      created.id,
      request('owner', ownerId),
    );
    expect(confirmed.intent).toMatchObject({
      status: 'confirmed',
      decidedByUserId: ownerId,
    });
    expect(confirmed.intent.decidedAt).not.toBeNull();
    expect(confirmed.subscription).toMatchObject({
      planCode: 'standalone-full',
      status: 'active',
      trialEndsAt: null,
    });

    const events = await harness.dataSource.getRepository(DomainOutbox).find();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'commercial.subscription.upgraded',
      idempotencyKey: `upgrade-intent-confirmed:${created.id}`,
    });

    // Ya decidido: ni re-confirmar ni cancelar.
    await expect(
      controller.confirmUpgradeIntent(created.id, request('owner', ownerId)),
    ).rejects.toThrow(ConflictException);
    await expect(
      controller.cancelUpgradeIntent(created.id, request('owner', ownerId)),
    ).rejects.toThrow(ConflictException);

    const listed = await controller.listUpgradeIntents(
      request('admin', ownerId),
    );
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({ status: 'confirmed' });
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

  it('un confirm contra un plan desactivado se deshace completo (misma transacción)', async () => {
    const created = await controller.createUpgradeIntent(
      { requestedPlanCode: 'standalone-full' },
      request('owner', ownerId),
    );
    await harness.dataSource
      .getRepository(PlanCatalog)
      .update({ code: 'standalone-full' }, { active: false });

    await expect(
      controller.confirmUpgradeIntent(created.id, request('owner', ownerId)),
    ).rejects.toThrow(ConflictException);

    // El intent sigue pending (la decisión se revirtió con el rollback) y la
    // suscripción no cambió.
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

  it('un intent de otra organización responde 404 fail-closed', async () => {
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
    await expect(
      controller.confirmUpgradeIntent(
        created.id,
        request('owner', otherOwner.id, otherOrganization.id),
      ),
    ).rejects.toThrow(NotFoundException);
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

    // El upgrade confirmado reactiva la organización suspendida.
    const created = await controller.createUpgradeIntent(
      { requestedPlanCode: 'standalone-full' },
      request('owner', ownerId),
    );
    await controller.confirmUpgradeIntent(
      created.id,
      request('owner', ownerId),
    );
    const after = await controller.subscription(request('owner', ownerId));
    expect(after.subscription).toMatchObject({
      planCode: 'standalone-full',
      status: 'active',
      effective: true,
    });
  });
});
