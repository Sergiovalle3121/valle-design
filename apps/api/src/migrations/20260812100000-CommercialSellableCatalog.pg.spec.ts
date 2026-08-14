import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../common/testing/postgres-harness';
import {
  PlanCatalog,
  PlanEntitlement,
} from '../modules/commercial/entities/commercial.entities';
import { CommercialSellableCatalog20260812100000 } from './20260812100000-CommercialSellableCatalog';

/**
 * La reconciliación se prueba contra PostgreSQL real porque su semántica ES
 * `ON CONFLICT DO NOTHING`: qué filas repone, cuáles respeta y que el mismo
 * `up` puede correr sobre un catálogo sano, dañado o vacío sin divergir. Un
 * runner capturador afirmaría las cadenas SQL, no el resultado.
 */
describePostgres('CommercialSellableCatalog (reconciliación real)', () => {
  jest.setTimeout(60_000);

  let harness: PostgresHarness;

  beforeAll(async () => {
    harness = await createPostgresHarness([PlanCatalog, PlanEntitlement], {
      schemaPrefix: 'sellable_catalog',
    });
  });

  afterAll(async () => {
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    await harness.truncateAll();
  });

  async function run(direction: 'up' | 'down'): Promise<void> {
    const migration = new CommercialSellableCatalog20260812100000();
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

  const runUp = () => run('up');

  async function catalog(): Promise<
    Array<{ code: string; active: boolean; entitlements: string[] }>
  > {
    const plans = await harness.dataSource
      .getRepository(PlanCatalog)
      .find({ order: { code: 'ASC' } });
    const entitlements = await harness.dataSource
      .getRepository(PlanEntitlement)
      .find();
    return plans.map((plan) => ({
      code: plan.code,
      active: plan.active,
      entitlements: entitlements
        .filter((entry) => entry.planCode === plan.code)
        .map((entry) => entry.entitlementCode)
        .sort(),
    }));
  }

  it('sobre un catálogo vacío siembra trial y plan vendible completos', async () => {
    await runUp();
    expect(await catalog()).toEqual([
      { code: 'standalone-full', active: true, entitlements: ['design.cad'] },
      { code: 'standalone-trial', active: true, entitlements: ['design.cad'] },
    ]);
  });

  it('repone un entitlement perdido sin duplicar el existente', async () => {
    await runUp();
    // Daño operacional: el entitlement del trial desapareció (borrado manual)
    // y el plan quedó "parcial" — exactamente el estado que el bootstrap se
    // niega a reparar y que producía 503 sin camino revisado de vuelta.
    await harness.dataSource
      .getRepository(PlanEntitlement)
      .delete({ planCode: 'standalone-trial' });

    await runUp();
    expect(await catalog()).toEqual([
      { code: 'standalone-full', active: true, entitlements: ['design.cad'] },
      { code: 'standalone-trial', active: true, entitlements: ['design.cad'] },
    ]);
  });

  it('jamás reactiva un plan que el operador apagó', async () => {
    await runUp();
    await harness.dataSource
      .getRepository(PlanCatalog)
      .update({ code: 'standalone-trial' }, { active: false });

    await runUp();
    expect(await catalog()).toEqual([
      { code: 'standalone-full', active: true, entitlements: ['design.cad'] },
      // El interruptor del operador sobrevive a la reconciliación.
      { code: 'standalone-trial', active: false, entitlements: ['design.cad'] },
    ]);
  });

  it('el down retira sólo el plan vendible y deja intacto el trial', async () => {
    await runUp();
    await run('down');
    expect(await catalog()).toEqual([
      { code: 'standalone-trial', active: true, entitlements: ['design.cad'] },
    ]);
  });
});
