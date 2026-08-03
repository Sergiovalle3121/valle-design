import type { DataSource } from 'typeorm';
import { PostgresEntitlementService } from './adapters/postgres.adapters';
import {
  PlanCatalog,
  PlanEntitlement,
  Subscription,
} from './entities/commercial.entities';

function entitlementDatabase(entitled: boolean) {
  const query = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawOne: jest
      .fn()
      .mockResolvedValue(entitled ? { entitled: 1 } : undefined),
  };
  const repository = {
    createQueryBuilder: jest.fn().mockReturnValue(query),
  };
  const getRepository = jest.fn().mockReturnValue(repository);
  const db = {
    getRepository,
  } as unknown as DataSource;
  return { db, getRepository, query, repository };
}

describe('commercial policy', () => {
  it('fails closed without organization and isolates the lookup by organization and tenant', async () => {
    const { db, getRepository, query, repository } = entitlementDatabase(true);
    const service = new PostgresEntitlementService(db);
    await expect(
      service.hasEntitlement('design.cad', { tenantId: 't' }),
    ).resolves.toBe(false);
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();

    await expect(
      service.hasEntitlement('design.cad', {
        organizationId: 'o',
        tenantId: 't',
      }),
    ).resolves.toBe(false);
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();

    await expect(
      service.hasEntitlement('design.cad', {
        organizationId: 'o',
        tenantId: 'o',
      }),
    ).resolves.toBe(true);
    expect(getRepository).toHaveBeenCalledWith(Subscription);
    expect(query.where).toHaveBeenCalledWith(
      'subscription.organizationId = :organizationId',
      { organizationId: 'o' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'subscription.tenantId = :tenantId',
      { tenantId: 'o' },
    );
  });

  it('never grants a development bypass', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const { db, query } = entitlementDatabase(false);
    try {
      await expect(
        new PostgresEntitlementService(db).hasEntitlement('design.cad', {
          organizationId: 'o',
          tenantId: 'o',
        }),
      ).resolves.toBe(false);
      expect(query.getRawOne).toHaveBeenCalledTimes(1);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('evaluates trials against an explicit clock so an expired trial is denied', async () => {
    const { db, query } = entitlementDatabase(false);
    const service = new PostgresEntitlementService(db);
    const now = new Date('2026-08-02T00:00:00Z');
    await expect(
      service.hasEntitlement('design.cad', {
        organizationId: 'o',
        tenantId: 'o',
        now,
      }),
    ).resolves.toBe(false);
    expect(query.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('subscription.trialEndsAt > :now'),
      { active: 'active', trialing: 'trialing', now },
    );
  });

  it('requires the requested entitlement to be attached to the selected active plan', async () => {
    const { db, query } = entitlementDatabase(false);
    await new PostgresEntitlementService(db).hasEntitlement('design.export', {
      organizationId: 'o',
      tenantId: 'o',
    });
    expect(query.innerJoin).toHaveBeenNthCalledWith(
      1,
      PlanCatalog,
      'plan',
      expect.stringContaining('plan.active = :planActive'),
      { planActive: true },
    );
    expect(query.innerJoin).toHaveBeenNthCalledWith(
      2,
      PlanEntitlement,
      'entitlement',
      expect.stringContaining('entitlement.entitlementCode = :code'),
      { code: 'design.export' },
    );
  });
});
