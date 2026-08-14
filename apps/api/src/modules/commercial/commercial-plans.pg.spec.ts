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
 * El catálogo publicado contra PostgreSQL real: aquí `amount_cents` es un
 * bigint que el driver devuelve como STRING y el índice único parcial es el
 * de producción. Esta suite fija que la consulta con precios normaliza los
 * céntimos a número y que la unicidad por combinación activa es real.
 */
describePostgres('CommercialController plans (PostgreSQL)', () => {
  jest.setTimeout(60_000);

  let harness: PostgresHarness;
  let controller: CommercialController;

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
      { schemaPrefix: 'commercial_plans' },
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
    await harness.dataSource.getRepository(PlanCatalog).save([
      { code: 'standalone-trial', active: true, metadata: { kind: 'trial' } },
      {
        code: 'standalone-full',
        active: true,
        metadata: { kind: 'paid', name: 'Valle Design completo' },
      },
    ]);
    await harness.dataSource.getRepository(PlanEntitlement).save([
      { planCode: 'standalone-trial', entitlementCode: 'design.cad' },
      { planCode: 'standalone-full', entitlementCode: 'design.cad' },
    ]);
  });

  function request(): Request {
    const user: AuthenticatedUser = {
      userId: 'user-plans',
      email: 'never-published@example.test',
      role: 'viewer',
      tenant_id: null,
      organization_id: null,
      plant_id: null,
      permissions: null,
      scopes: null,
    };
    return { user } as unknown as Request;
  }

  it('publica el catálogo con céntimos numéricos aunque el driver devuelva string', async () => {
    await harness.dataSource.getRepository(PlanPrice).save([
      {
        planCode: 'standalone-full',
        currency: 'USD',
        period: 'monthly',
        amountCents: '2900',
        active: true,
      },
      {
        planCode: 'standalone-full',
        currency: 'USD',
        period: 'yearly',
        amountCents: '29900',
        active: true,
      },
      {
        planCode: 'standalone-full',
        currency: 'USD',
        period: 'monthly',
        amountCents: '1900',
        active: false,
      },
    ]);

    const published = await controller.listPlans(request());
    expect(published.checkout).toBe('external');
    expect(published.items).toEqual([
      {
        code: 'standalone-full',
        name: 'Valle Design completo',
        entitlements: ['design.cad'],
        prices: [
          { currency: 'USD', period: 'monthly', amountCents: 2900 },
          { currency: 'USD', period: 'yearly', amountCents: 29900 },
        ],
      },
      {
        code: 'standalone-trial',
        name: 'standalone-trial',
        entitlements: ['design.cad'],
        prices: [],
      },
    ]);
  });

  it('el índice único parcial arbitra: un solo precio activo por combinación', async () => {
    const prices = harness.dataSource.getRepository(PlanPrice);
    await prices.save({
      planCode: 'standalone-full',
      currency: 'USD',
      period: 'monthly',
      amountCents: '2900',
      active: true,
    });
    await expect(
      prices.insert({
        planCode: 'standalone-full',
        currency: 'USD',
        period: 'monthly',
        amountCents: '3900',
        active: true,
      }),
    ).rejects.toMatchObject({ driverError: { code: '23505' } });

    // Cambiar de precio es desactivar el vigente y activar el siguiente.
    await prices.update(
      { planCode: 'standalone-full', currency: 'USD', period: 'monthly' },
      { active: false },
    );
    await prices.insert({
      planCode: 'standalone-full',
      currency: 'USD',
      period: 'monthly',
      amountCents: '3900',
      active: true,
    });

    const published = await controller.listPlans(request());
    expect(published.items[0].prices).toEqual([
      { currency: 'USD', period: 'monthly', amountCents: 3900 },
    ]);
  });
});
