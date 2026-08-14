import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../common/testing/postgres-harness';
import { PlanCatalog } from '../modules/commercial/entities/commercial.entities';
import { PlanPrices20260814100000 } from './20260814100000-PlanPrices';

/**
 * Los invariantes de plan_prices viven en el ESQUEMA (checks, FK e índice
 * único parcial), así que se prueban contra PostgreSQL real: qué filas acepta,
 * cuáles rechaza y con qué código. Un runner capturador afirmaría cadenas SQL,
 * no el resultado.
 */
describePostgres('PlanPrices (esquema real)', () => {
  jest.setTimeout(60_000);

  let harness: PostgresHarness;

  async function run(direction: 'up' | 'down'): Promise<void> {
    const migration = new PlanPrices20260814100000();
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

  function insertPrice(values: {
    planCode?: string;
    currency?: string;
    period?: string;
    amountCents?: number;
    active?: boolean;
  }): Promise<unknown> {
    return harness.dataSource.query(
      `INSERT INTO "${harness.schema}"."plan_prices"
         ("plan_code", "currency", "period", "amount_cents", "active")
       VALUES ($1, $2, $3, $4, $5)`,
      [
        values.planCode ?? 'standalone-full',
        values.currency ?? 'USD',
        values.period ?? 'monthly',
        values.amountCents ?? 2900,
        values.active ?? true,
      ],
    );
  }

  beforeAll(async () => {
    // Sólo plan_catalog viene del arnés: plan_prices la crea la migración.
    harness = await createPostgresHarness([PlanCatalog], {
      schemaPrefix: 'plan_prices_migration',
    });
    await run('up');
  });

  afterAll(async () => {
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    // TRUNCATE … CASCADE del arnés arrastra plan_prices vía su FK.
    await harness.truncateAll();
    await harness.dataSource
      .getRepository(PlanCatalog)
      .save([
        { code: 'standalone-full', active: true, metadata: { kind: 'paid' } },
      ]);
  });

  it('acepta un precio bien formado, incluido el precio cero', async () => {
    await expect(insertPrice({})).resolves.toBeDefined();
    await expect(
      insertPrice({ period: 'yearly', amountCents: 0 }),
    ).resolves.toBeDefined();
    await expect(
      harness.dataSource.query(
        `SELECT "currency", "period", "amount_cents", "active"
           FROM "${harness.schema}"."plan_prices" ORDER BY "period"`,
      ),
    ).resolves.toEqual([
      {
        currency: 'USD',
        period: 'monthly',
        amount_cents: '2900',
        active: true,
      },
      { currency: 'USD', period: 'yearly', amount_cents: '0', active: true },
    ]);
  });

  it('permite UN solo precio activo por (plan, moneda, período)', async () => {
    await insertPrice({});
    await expect(insertPrice({ amountCents: 3900 })).rejects.toMatchObject({
      code: '23505',
    });
    // El índice es parcial: la historia de precios desactivados convive.
    await expect(
      insertPrice({ amountCents: 1900, active: false }),
    ).resolves.toBeDefined();
    await expect(
      insertPrice({ amountCents: 999, active: false }),
    ).resolves.toBeDefined();
    // Y otra moneda u otro período no compiten con el activo existente.
    await expect(insertPrice({ currency: 'EUR' })).resolves.toBeDefined();
    await expect(insertPrice({ period: 'yearly' })).resolves.toBeDefined();
  });

  it('hace irrepresentables moneda no ISO, período desconocido y céntimos negativos', async () => {
    await expect(insertPrice({ currency: 'usd' })).rejects.toMatchObject({
      code: '23514',
    });
    await expect(insertPrice({ currency: 'US' })).rejects.toMatchObject({
      code: '23514',
    });
    await expect(insertPrice({ period: 'weekly' })).rejects.toMatchObject({
      code: '23514',
    });
    await expect(insertPrice({ amountCents: -1 })).rejects.toMatchObject({
      code: '23514',
    });
  });

  it('los precios son hijos del catálogo: FK obligatoria y borrado en cascada', async () => {
    await expect(
      insertPrice({ planCode: 'plan-fantasma' }),
    ).rejects.toMatchObject({ code: '23503' });

    await insertPrice({});
    await harness.dataSource.query(
      `DELETE FROM "${harness.schema}"."plan_catalog" WHERE "code" = 'standalone-full'`,
    );
    await expect(
      harness.dataSource.query(
        `SELECT count(*)::int AS "total" FROM "${harness.schema}"."plan_prices"`,
      ),
    ).resolves.toEqual([{ total: 0 }]);
  });

  it('el down retira la tabla completa y el up la repone', async () => {
    await run('down');
    await expect(insertPrice({})).rejects.toMatchObject({ code: '42P01' });
    await run('up');
    await expect(insertPrice({})).resolves.toBeDefined();
  });
});
