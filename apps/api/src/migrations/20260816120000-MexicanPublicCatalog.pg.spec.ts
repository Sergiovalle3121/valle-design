import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../common/testing/postgres-harness';
import {
  PlanCatalog,
  PlanEntitlement,
  PlanPrice,
} from '../modules/commercial/entities/commercial.entities';
import { MexicanPublicCatalog20260816120000 } from './20260816120000-MexicanPublicCatalog';

/**
 * Esta migración es la que decide cuánto cuesta el producto, así que se prueba
 * contra PostgreSQL real y no contra un doble: su comportamiento vive en la
 * semántica de `ON CONFLICT`, en la fusión de JSONB con `||` y en el índice
 * único parcial de precios activos. Un runner capturador afirmaría las cadenas
 * SQL; lo que hay que afirmar es el importe que verá un cliente.
 */
describePostgres('MexicanPublicCatalog (oferta real en MXN)', () => {
  jest.setTimeout(60_000);

  let harness: PostgresHarness;

  beforeAll(async () => {
    harness = await createPostgresHarness(
      [PlanCatalog, PlanEntitlement, PlanPrice],
      { schemaPrefix: 'mexican_catalog' },
    );
  });

  afterAll(async () => {
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    await harness.truncateAll();
  });

  async function run(direction: 'up' | 'down'): Promise<void> {
    const migration = new MexicanPublicCatalog20260816120000();
    const runner = harness.dataSource.createQueryRunner();
    await runner.connect();
    try {
      // El SQL de la migración es no calificado (como en la cadena real); el
      // esquema desechable del arnés se selecciona vía search_path.
      await runner.query(`SET search_path TO "${harness.schema}"`);
      await migration[direction](runner);
    } finally {
      await runner.release();
    }
  }

  async function priceOf(
    planCode: string,
    period: 'monthly' | 'yearly',
  ): Promise<number> {
    const row = await harness.dataSource
      .getRepository(PlanPrice)
      .findOneByOrFail({ planCode, currency: 'MXN', period, active: true });
    return Number(row.amountCents);
  }

  it('publica la oferta mexicana con los importes que se cobran', async () => {
    await run('up');

    expect(await priceOf('individual', 'monthly')).toBe(19_900);
    expect(await priceOf('individual', 'yearly')).toBe(199_000);
    expect(await priceOf('despacho', 'monthly')).toBe(16_900);
    expect(await priceOf('despacho', 'yearly')).toBe(169_000);

    // El anual tiene que ser un descuento REAL frente a doce mensualidades, o
    // no es un plan anual: es el mismo precio con menos flexibilidad.
    expect(await priceOf('individual', 'yearly')).toBeLessThan(
      (await priceOf('individual', 'monthly')) * 12,
    );

    const plans = harness.dataSource.getRepository(PlanCatalog);
    await expect(
      plans.findOneByOrFail({ code: 'individual' }),
    ).resolves.toMatchObject({
      active: true,
      metadata: {
        public: true,
        name: 'Individual',
        kind: 'paid',
        perSeat: false,
        seatsMinimum: 1,
        taxIncluded: true,
      },
    });
    // El plan de despacho cobra POR USUARIO: si `perSeat` se perdiera, la
    // página de precios pondría 169 al lado de 199 como si fueran comparables.
    await expect(
      plans.findOneByOrFail({ code: 'despacho' }),
    ).resolves.toMatchObject({
      metadata: { perSeat: true, seatsMinimum: 3 },
    });

    for (const planCode of ['individual', 'despacho']) {
      await expect(
        harness.dataSource
          .getRepository(PlanEntitlement)
          .findOneByOrFail({ planCode, entitlementCode: 'design.cad' }),
      ).resolves.toBeDefined();
    }
  });

  it('añade presentación al trial sin borrar lo que ya tenía', async () => {
    const plans = harness.dataSource.getRepository(PlanCatalog);
    await plans.save(
      plans.create({
        code: 'standalone-trial',
        active: true,
        metadata: { kind: 'trial', pricePublished: false },
      }),
    );

    await run('up');

    await expect(
      plans.findOneByOrFail({ code: 'standalone-trial' }),
    ).resolves.toMatchObject({
      metadata: {
        // Clave preexistente de la fundación comercial: sigue ahí.
        pricePublished: false,
        public: true,
        name: 'Prueba',
        kind: 'trial',
      },
    });
    // Gratis significa sin precio: el trial jamás recibe fila en plan_prices.
    await expect(
      harness.dataSource
        .getRepository(PlanPrice)
        .countBy({ planCode: 'standalone-trial' }),
    ).resolves.toBe(0);
  });

  it('respeta un precio que el operador ya hubiera publicado', async () => {
    const plans = harness.dataSource.getRepository(PlanCatalog);
    const prices = harness.dataSource.getRepository(PlanPrice);
    await plans.save(plans.create({ code: 'individual', active: true }));
    // El operador subió el precio antes de que corriera la migración.
    await prices.save(
      prices.create({
        planCode: 'individual',
        currency: 'MXN',
        period: 'monthly',
        amountCents: 24_900,
        active: true,
      }),
    );

    await run('up');

    // Un precio vivo es una decisión comercial; una migración no lo pisa.
    expect(await priceOf('individual', 'monthly')).toBe(24_900);
    // Y lo que sí faltaba (el anual) se publica igualmente.
    expect(await priceOf('individual', 'yearly')).toBe(199_000);
  });

  it('no reactiva un plan que el operador apagó', async () => {
    const plans = harness.dataSource.getRepository(PlanCatalog);
    await plans.save(
      plans.create({
        code: 'despacho',
        active: false,
        metadata: { disabledBy: 'operator' },
      }),
    );

    await run('up');

    await expect(
      plans.findOneByOrFail({ code: 'despacho' }),
    ).resolves.toMatchObject({
      active: false,
      // La presentación se completa, pero apagar el plan sigue siendo el
      // interruptor del operador: sólo él lo vuelve a encender.
      metadata: { disabledBy: 'operator', public: true },
    });
  });

  it('revierte la oferta y deja el trial como estaba', async () => {
    const plans = harness.dataSource.getRepository(PlanCatalog);
    await plans.save(
      plans.create({
        code: 'standalone-trial',
        active: true,
        metadata: { kind: 'trial', pricePublished: false },
      }),
    );

    await run('up');
    await run('down');

    await expect(plans.countBy({ code: 'individual' })).resolves.toBe(0);
    await expect(plans.countBy({ code: 'despacho' })).resolves.toBe(0);
    await expect(
      harness.dataSource.getRepository(PlanPrice).count(),
    ).resolves.toBe(0);
    await expect(
      plans.findOneByOrFail({ code: 'standalone-trial' }),
    ).resolves.toMatchObject({
      metadata: { kind: 'trial', pricePublished: false },
    });
    const trial = await plans.findOneByOrFail({ code: 'standalone-trial' });
    expect(trial.metadata).not.toHaveProperty('public');
    expect(trial.metadata).not.toHaveProperty('name');

    // Y un segundo `up` reconstruye la oferta idéntica: la migración es
    // idempotente en los dos sentidos, que es lo que hace ensayable un
    // rollback en producción.
    await run('up');
    expect(await priceOf('individual', 'monthly')).toBe(19_900);
  });
});
