import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Organization } from '../organizations/entities/organization.entity';
import { User } from '../identity/entities/identity.entity';
import { PostgresEntitlementService } from './adapters/postgres.adapters';
import {
  PlanCatalog,
  PlanEntitlement,
  Subscription,
} from './entities/commercial.entities';

/**
 * Vigencia real de `design.cad` (P0-B, campaña de seguridad 2026-08-23),
 * contra un motor SQL de verdad — no mocks — para que la comparación de
 * fechas la arbitre el propio motor y no una suposición del test.
 *
 * SQLite (better-sqlite3, en memoria) basta aquí porque lo que se ejerce es
 * comparación de valores (`status = X AND currentPeriodEnd > now`), no
 * concurrencia ni bloqueos — eso sí exige PostgreSQL real, ver
 * `postgres-harness.ts`. Las columnas usan el tipo `datetime`/`simple-json`
 * (ver `date-column-type.ts`) porque en este proceso no hay
 * `DATABASE_URL`/`DB_HOST`, exactamente lo que ya hacen los tests de
 * integración HTTP del módulo de organizaciones.
 */
describe('PostgresEntitlementService — vigencia real de una suscripción activa', () => {
  let dataSource: DataSource;
  let service: PostgresEntitlementService;
  let organizationId: string;
  const PLAN_CODE = 'standalone-full';
  const ENTITLEMENT_CODE = 'design.cad';

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      dropSchema: true,
      synchronize: true,
      entities: [
        User,
        Organization,
        PlanCatalog,
        PlanEntitlement,
        Subscription,
      ],
    });
    await dataSource.initialize();
    service = new PostgresEntitlementService(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM subscriptions');
    await dataSource.query('DELETE FROM plan_entitlements');
    await dataSource.query('DELETE FROM plan_catalog');
    await dataSource.query('DELETE FROM organizations');
    await dataSource.query('DELETE FROM identity_users');

    const owner = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        email: `entitlement-owner-${randomUUID()}@example.test`,
      }),
    );
    organizationId = (
      await dataSource.getRepository(Organization).save(
        dataSource.getRepository(Organization).create({
          name: 'Entitlement period org',
          slug: `entitlement-period-${randomUUID()}`,
          ownerUserId: owner.id,
        }),
      )
    ).id;
    await dataSource.getRepository(PlanCatalog).save({
      code: PLAN_CODE,
      active: true,
      metadata: { kind: 'paid' },
    });
    await dataSource.getRepository(PlanEntitlement).save({
      planCode: PLAN_CODE,
      entitlementCode: ENTITLEMENT_CODE,
    });
  });

  async function seedActiveSubscription(
    currentPeriodEnd: Date | null,
  ): Promise<void> {
    await dataSource.getRepository(Subscription).save({
      organizationId,
      tenantId: organizationId,
      planCode: PLAN_CODE,
      status: 'active',
      trialEndsAt: null,
      currentPeriodEnd,
      seats: 1,
    });
  }

  function hasEntitlement(now: Date): Promise<boolean> {
    return service.hasEntitlement(ENTITLEMENT_CODE, {
      organizationId,
      tenantId: organizationId,
      now,
    });
  }

  it('concede 1 ms antes de currentPeriodEnd', async () => {
    const periodEnd = new Date('2026-09-01T00:00:00.000Z');
    await seedActiveSubscription(periodEnd);
    await expect(
      hasEntitlement(new Date(periodEnd.getTime() - 1)),
    ).resolves.toBe(true);
  });

  it('deniega EXACTAMENTE en currentPeriodEnd (el instante límite ya no cuenta)', async () => {
    const periodEnd = new Date('2026-09-01T00:00:00.000Z');
    await seedActiveSubscription(periodEnd);
    await expect(hasEntitlement(new Date(periodEnd.getTime()))).resolves.toBe(
      false,
    );
  });

  it('deniega 1 ms después de currentPeriodEnd', async () => {
    const periodEnd = new Date('2026-09-01T00:00:00.000Z');
    await seedActiveSubscription(periodEnd);
    await expect(
      hasEntitlement(new Date(periodEnd.getTime() + 1)),
    ).resolves.toBe(false);
  });

  it('status=active con currentPeriodEnd en el pasado NO concede design.cad', async () => {
    await seedActiveSubscription(new Date('2020-01-01T00:00:00.000Z'));
    await expect(
      hasEntitlement(new Date('2026-08-23T00:00:00.000Z')),
    ).resolves.toBe(false);
  });

  it('status=active con currentPeriodEnd NULL falla cerrado (sin vigencia probada)', async () => {
    await seedActiveSubscription(null);
    await expect(
      hasEntitlement(new Date('2026-08-23T00:00:00.000Z')),
    ).resolves.toBe(false);
  });

  it('status=active con currentPeriodEnd futuro concede design.cad', async () => {
    await seedActiveSubscription(new Date('2099-01-01T00:00:00.000Z'));
    await expect(
      hasEntitlement(new Date('2026-08-23T00:00:00.000Z')),
    ).resolves.toBe(true);
  });
});
