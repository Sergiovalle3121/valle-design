import { DataSource } from 'typeorm';
import {
  CommercialCatalogBootstrap,
  SAMPLE_PLAN_PRICE,
  STANDALONE_CAD_ENTITLEMENT,
  STANDALONE_FULL_PLAN_CODE,
  STANDALONE_TRIAL_PLAN_CODE,
} from './commercial-catalog.bootstrap';
import {
  PlanCatalog,
  PlanEntitlement,
  PlanPrice,
} from './entities/commercial.entities';

describe('CommercialCatalogBootstrap', () => {
  let database: DataSource;
  const originalNodeEnvironment = process.env.NODE_ENV;

  beforeEach(async () => {
    database = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [PlanCatalog, PlanEntitlement, PlanPrice],
      synchronize: true,
    });
    await database.initialize();
  });

  afterEach(async () => {
    if (database.isInitialized) await database.destroy();
    if (originalNodeEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnvironment;
  });

  it('seeds the migration-equivalent catalog only when it is completely empty', async () => {
    await new CommercialCatalogBootstrap(database).onApplicationBootstrap();

    await expect(
      database.getRepository(PlanCatalog).findOneByOrFail({
        code: STANDALONE_TRIAL_PLAN_CODE,
      }),
    ).resolves.toMatchObject({
      active: true,
      metadata: { kind: 'trial', pricePublished: false },
    });
    // Paridad con producción: el plan vendible existe también en dev, así el
    // flujo de upgrade se puede ejercer sin tocar la base a mano.
    await expect(
      database.getRepository(PlanCatalog).findOneByOrFail({
        code: STANDALONE_FULL_PLAN_CODE,
      }),
    ).resolves.toMatchObject({
      active: true,
      metadata: { kind: 'paid', pricePublished: false },
    });
    for (const planCode of [
      STANDALONE_TRIAL_PLAN_CODE,
      STANDALONE_FULL_PLAN_CODE,
    ]) {
      await expect(
        database.getRepository(PlanEntitlement).findOneByOrFail({
          planCode,
          entitlementCode: STANDALONE_CAD_ENTITLEMENT,
        }),
      ).resolves.toBeDefined();
    }
  });

  it('siembra el precio de ejemplo del plan VENDIBLE solo sobre precios vacíos', async () => {
    await new CommercialCatalogBootstrap(database).onApplicationBootstrap();

    const prices = await database.getRepository(PlanPrice).find();
    expect(prices).toHaveLength(1);
    expect(prices[0]).toMatchObject({
      planCode: STANDALONE_FULL_PLAN_CODE,
      currency: SAMPLE_PLAN_PRICE.currency,
      period: SAMPLE_PLAN_PRICE.period,
      active: true,
    });
    expect(Number(prices[0].amountCents)).toBe(SAMPLE_PLAN_PRICE.amountCents);
    // El trial es gratuito por definición: jamás recibe precio de ejemplo.
    await expect(
      database
        .getRepository(PlanPrice)
        .countBy({ planCode: STANDALONE_TRIAL_PLAN_CODE }),
    ).resolves.toBe(0);

    // Idempotente: un segundo arranque no duplica el precio.
    await new CommercialCatalogBootstrap(database).onApplicationBootstrap();
    await expect(database.getRepository(PlanPrice).count()).resolves.toBe(1);
  });

  it('never repairs or completes operator-owned prices', async () => {
    await new CommercialCatalogBootstrap(database).onApplicationBootstrap();
    // El operador definió su propio precio (y apagó el de ejemplo).
    const prices = database.getRepository(PlanPrice);
    await prices.clear();
    await prices.save({
      planCode: STANDALONE_FULL_PLAN_CODE,
      currency: 'EUR',
      period: 'yearly',
      amountCents: 19900,
      active: false,
    });

    await new CommercialCatalogBootstrap(database).onApplicationBootstrap();

    // Tabla NO vacía = configuración del operador: ni se repone el ejemplo ni
    // se reactiva nada.
    const persisted = await prices.find();
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      currency: 'EUR',
      period: 'yearly',
      active: false,
    });
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
    // Los precios de producción llegan por migración revisada u operador.
    await expect(database.getRepository(PlanPrice).count()).resolves.toBe(0);
  });
});
