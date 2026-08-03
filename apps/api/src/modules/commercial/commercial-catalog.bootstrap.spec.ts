import { DataSource } from 'typeorm';
import {
  CommercialCatalogBootstrap,
  STANDALONE_CAD_ENTITLEMENT,
  STANDALONE_TRIAL_PLAN_CODE,
} from './commercial-catalog.bootstrap';
import { PlanCatalog, PlanEntitlement } from './entities/commercial.entities';

describe('CommercialCatalogBootstrap', () => {
  let database: DataSource;
  const originalNodeEnvironment = process.env.NODE_ENV;

  beforeEach(async () => {
    database = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [PlanCatalog, PlanEntitlement],
      synchronize: true,
    });
    await database.initialize();
  });

  afterEach(async () => {
    if (database.isInitialized) await database.destroy();
    if (originalNodeEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnvironment;
  });

  it('seeds the migration-equivalent trial only for a completely empty catalog', async () => {
    await new CommercialCatalogBootstrap(database).onApplicationBootstrap();

    await expect(
      database.getRepository(PlanCatalog).findOneByOrFail({
        code: STANDALONE_TRIAL_PLAN_CODE,
      }),
    ).resolves.toMatchObject({
      active: true,
      metadata: { kind: 'trial', pricePublished: false },
    });
    await expect(
      database.getRepository(PlanEntitlement).findOneByOrFail({
        planCode: STANDALONE_TRIAL_PLAN_CODE,
        entitlementCode: STANDALONE_CAD_ENTITLEMENT,
      }),
    ).resolves.toBeDefined();
  });

  it('never reactivates or repairs an existing operator-owned catalog', async () => {
    const plans = database.getRepository(PlanCatalog);
    await plans.save(
      plans.create({
        code: STANDALONE_TRIAL_PLAN_CODE,
        active: false,
        metadata: { disabledBy: 'operator' },
      }),
    );

    await new CommercialCatalogBootstrap(database).onApplicationBootstrap();

    await expect(
      plans.findOneByOrFail({ code: STANDALONE_TRIAL_PLAN_CODE }),
    ).resolves.toMatchObject({
      active: false,
      metadata: { disabledBy: 'operator' },
    });
    await expect(database.getRepository(PlanEntitlement).count()).resolves.toBe(
      0,
    );
  });

  it('never seeds production outside the reviewed migration chain', async () => {
    process.env.NODE_ENV = 'production';

    await new CommercialCatalogBootstrap(database).onApplicationBootstrap();

    await expect(database.getRepository(PlanCatalog).count()).resolves.toBe(0);
    await expect(database.getRepository(PlanEntitlement).count()).resolves.toBe(
      0,
    );
  });
});
