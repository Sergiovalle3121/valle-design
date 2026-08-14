import { randomUUID } from 'node:crypto';
import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import { User } from '../identity/entities/identity.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { PostgresCadEventPublisher } from './adapters/postgres.adapters';
import {
  DomainOutbox,
  PlanCatalog,
  PlanEntitlement,
  Subscription,
} from './entities/commercial.entities';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

/**
 * La transición del trial vencido se prueba contra PostgreSQL real porque su
 * garantía central es de CONCURRENCIA: dos lecturas simultáneas no pueden
 * suspender dos veces ni publicar dos eventos. SQLite serializa todas las
 * escrituras y dejaría esa garantía sin ejercer.
 */
describePostgres('SubscriptionLifecycleService (trial vencido)', () => {
  jest.setTimeout(60_000);

  let harness: PostgresHarness;
  let service: SubscriptionLifecycleService;
  let organizationId: string;

  beforeAll(async () => {
    harness = await createPostgresHarness(
      [
        User,
        Organization,
        PlanCatalog,
        PlanEntitlement,
        Subscription,
        DomainOutbox,
      ],
      { schemaPrefix: 'subscription_lifecycle' },
    );
    service = new SubscriptionLifecycleService(
      harness.dataSource,
      new PostgresCadEventPublisher(),
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
        email: `lifecycle-${randomUUID()}@example.test`,
        displayName: 'Lifecycle owner',
        emailVerifiedAt: new Date(),
      }),
    );
    const organizations = harness.dataSource.getRepository(Organization);
    organizationId = (
      await organizations.save(
        organizations.create({
          name: 'Lifecycle organization',
          slug: `lifecycle-${randomUUID()}`,
          ownerUserId: owner.id,
        }),
      )
    ).id;
    await harness.dataSource.getRepository(PlanCatalog).save({
      code: 'standalone-trial',
      active: true,
      metadata: { kind: 'trial' },
    });
  });

  async function seedSubscription(
    status: Subscription['status'],
    trialEndsAt: Date | null,
  ): Promise<Subscription> {
    return harness.dataSource.getRepository(Subscription).save({
      organizationId,
      tenantId: organizationId,
      planCode: 'standalone-trial',
      status,
      trialEndsAt,
    });
  }

  async function outboxEvents(): Promise<DomainOutbox[]> {
    return harness.dataSource.getRepository(DomainOutbox).find();
  }

  it('suspende el trial vencido y publica el evento exactamente una vez', async () => {
    const subscription = await seedSubscription(
      'trialing',
      new Date(Date.now() - 60_000),
    );

    await expect(
      service.settleExpiredTrial(organizationId, organizationId),
    ).resolves.toBe('suspended');
    await expect(
      harness.dataSource
        .getRepository(Subscription)
        .findOneByOrFail({ organizationId }),
    ).resolves.toMatchObject({ status: 'suspended' });

    // Reintento (la siguiente lectura comercial): sin nueva transición ni
    // evento duplicado.
    await expect(
      service.settleExpiredTrial(organizationId, organizationId),
    ).resolves.toBe('unchanged');
    const events = await outboxEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'commercial.trial.suspended',
      aggregateId: subscription.id,
      idempotencyKey: `commercial-trial-suspended:${subscription.id}`,
      status: 'pending',
    });
    expect(events[0].payload).toMatchObject({ planCode: 'standalone-trial' });
  });

  it('bajo carrera sólo una transición gana y sólo un evento se publica', async () => {
    await seedSubscription('trialing', new Date(Date.now() - 60_000));

    const results = await Promise.all([
      service.settleExpiredTrial(organizationId, organizationId),
      service.settleExpiredTrial(organizationId, organizationId),
      service.settleExpiredTrial(organizationId, organizationId),
    ]);
    expect(results.filter((outcome) => outcome === 'suspended')).toHaveLength(
      1,
    );
    expect(await outboxEvents()).toHaveLength(1);
  });

  it('no toca trials vigentes, suscripciones activas ni contextos inválidos', async () => {
    await seedSubscription('trialing', new Date(Date.now() + 86_400_000));
    await expect(
      service.settleExpiredTrial(organizationId, organizationId),
    ).resolves.toBe('unchanged');
    await expect(
      harness.dataSource
        .getRepository(Subscription)
        .findOneByOrFail({ organizationId }),
    ).resolves.toMatchObject({ status: 'trialing' });

    await harness.dataSource
      .getRepository(Subscription)
      .update({ organizationId }, { status: 'active', trialEndsAt: null });
    await expect(
      service.settleExpiredTrial(organizationId, organizationId),
    ).resolves.toBe('unchanged');

    // Contexto sin organización o con tenant ajeno: fail-closed sin escribir.
    await expect(service.settleExpiredTrial(null, null)).resolves.toBe(
      'unchanged',
    );
    await expect(
      service.settleExpiredTrial(organizationId, randomUUID()),
    ).resolves.toBe('unchanged');
    expect(await outboxEvents()).toHaveLength(0);
  });

  it('un trial sin fecha de fin nunca se suspende por lazy settle', async () => {
    await seedSubscription('trialing', null);
    await expect(
      service.settleExpiredTrial(organizationId, organizationId),
    ).resolves.toBe('unchanged');
    await expect(
      harness.dataSource
        .getRepository(Subscription)
        .findOneByOrFail({ organizationId }),
    ).resolves.toMatchObject({ status: 'trialing', trialEndsAt: null });
  });
});
