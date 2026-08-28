import { DataSource, Repository } from 'typeorm';
import type { PaymentProvider } from '../ports/payment-provider.port';
import {
  PlanCatalog,
  PlanEntitlement,
  PlanPrice,
} from '../entities/commercial.entities';
import { PublicCatalogController } from './public-catalog.controller';
import { OrganizationCommercialConfiguration } from '../../organizations/organization-commercial.configuration';

/**
 * Proveedor doble: el catálogo público sólo le pide el modo de cobro, y ese
 * modo es lo que decide si la web puede ofrecer un botón de compra o debe
 * decir que el cobro ocurre fuera del producto.
 */
function paymentsIn(mode: string): PaymentProvider {
  return {
    descriptor: () => ({ mode }),
  } as unknown as PaymentProvider;
}

describe('PublicCatalogController', () => {
  let database: DataSource;
  let plans: Repository<PlanCatalog>;
  let prices: Repository<PlanPrice>;

  beforeEach(async () => {
    database = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [PlanCatalog, PlanEntitlement, PlanPrice],
      synchronize: true,
    });
    await database.initialize();
    plans = database.getRepository(PlanCatalog);
    prices = database.getRepository(PlanPrice);
  });

  afterEach(async () => {
    if (database.isInitialized) await database.destroy();
  });

  function controller(
    mode = 'hosted',
    clock: () => number = () => 1_000,
    trialDays = 90,
  ): PublicCatalogController {
    return new PublicCatalogController(
      plans,
      prices,
      paymentsIn(mode),
      // La configuración REAL parsea `TRIAL_DAYS` al construirse y revienta el
      // arranque con un valor inválido; aquí se inyecta el resultado ya
      // resuelto para poder fijar la duración por caso.
      { trialDays },
      clock,
    );
  }

  async function seedPaidPlan(
    code: string,
    metadata: Record<string, unknown>,
    amountCents = 19_900,
    currency = 'MXN',
  ): Promise<void> {
    await plans.save(plans.create({ code, active: true, metadata }));
    await prices.save(
      prices.create({
        planCode: code,
        currency,
        period: 'monthly',
        amountCents,
        active: true,
      }),
    );
  }

  it('publica sólo los planes que el operador marcó publicables', async () => {
    await seedPaidPlan('individual', {
      public: true,
      name: 'Individual',
      kind: 'paid',
      seatsMinimum: 1,
      taxIncluded: true,
    });
    // Plan activo y con precio, pero SIN el interruptor de publicación: es
    // configuración interna y no debe aparecer en la página de precios.
    await seedPaidPlan('standalone-full', { kind: 'paid', name: 'Heredado' });

    const result = await controller().listPublicPlans({});

    expect(result.items.map((item) => item.code)).toEqual(['individual']);
    expect(result.checkout).toBe('hosted');
  });

  it('omite un plan de pago sin precio activo en vez de publicarlo sin importe', async () => {
    await plans.save(
      plans.create({
        code: 'despacho',
        active: true,
        metadata: { public: true, name: 'Despacho', kind: 'paid' },
      }),
    );
    // Precio existente pero DESACTIVADO: el plan sigue sin importe publicable.
    await prices.save(
      prices.create({
        planCode: 'despacho',
        currency: 'MXN',
        period: 'monthly',
        amountCents: 16_900,
        active: false,
      }),
    );

    await expect(controller().listPublicPlans({})).resolves.toMatchObject({
      items: [],
    });
  });

  it('publica el trial sin precio porque gratis no es un importe que falte', async () => {
    await plans.save(
      plans.create({
        code: 'standalone-trial',
        active: true,
        metadata: { public: true, name: 'Prueba', kind: 'trial' },
      }),
    );

    const result = await controller().listPublicPlans({});

    expect(result.items).toEqual([
      {
        code: 'standalone-trial',
        name: 'Prueba',
        kind: 'trial',
        perSeat: false,
        seatsMinimum: 1,
        taxIncluded: false,
        prices: [],
      },
    ]);
  });

  it('nunca publica un plan inactivo aunque esté marcado publicable', async () => {
    await plans.save(
      plans.create({
        code: 'individual',
        active: false,
        metadata: { public: true, name: 'Individual', kind: 'paid' },
      }),
    );
    await prices.save(
      prices.create({
        planCode: 'individual',
        currency: 'MXN',
        period: 'monthly',
        amountCents: 19_900,
        active: true,
      }),
    );

    await expect(controller().listPublicPlans({})).resolves.toMatchObject({
      items: [],
    });
  });

  it('no expone entitlements ni metadata cruda del operador', async () => {
    await seedPaidPlan('individual', {
      public: true,
      name: 'Individual',
      kind: 'paid',
      seatsMinimum: 1,
      taxIncluded: true,
      // Claves internas que jamás deben salir por una ruta anónima.
      stripePriceId: 'price_secreto',
      margenInterno: 0.42,
    });
    await database.getRepository(PlanEntitlement).save({
      planCode: 'individual',
      entitlementCode: 'design.cad',
    });

    const result = await controller().listPublicPlans({});

    expect(Object.keys(result.items[0]).sort()).toEqual(
      [
        'code',
        'kind',
        'name',
        'perSeat',
        'prices',
        'seatsMinimum',
        'taxIncluded',
      ].sort(),
    );
    expect(JSON.stringify(result)).not.toContain('price_secreto');
    expect(JSON.stringify(result)).not.toContain('design.cad');
  });

  it('publica el precio por asiento distinguiéndolo del precio por cuenta', async () => {
    await seedPaidPlan(
      'despacho',
      {
        public: true,
        name: 'Despacho',
        kind: 'paid',
        perSeat: true,
        seatsMinimum: 3,
        taxIncluded: true,
      },
      16_900,
    );

    const [plan] = (await controller().listPublicPlans({})).items;

    expect(plan).toMatchObject({ perSeat: true, seatsMinimum: 3 });
    expect(plan.prices).toEqual([
      { currency: 'MXN', period: 'monthly', amountCents: 16_900 },
    ]);
  });

  it('filtra por moneda para que una página de precios no mezcle divisas', async () => {
    await seedPaidPlan(
      'individual',
      { public: true, name: 'Individual', kind: 'paid' },
      19_900,
      'MXN',
    );
    await prices.save(
      prices.create({
        planCode: 'individual',
        currency: 'USD',
        period: 'monthly',
        amountCents: 2_900,
        active: true,
      }),
    );

    const mexican = await controller().listPublicPlans({ currency: 'MXN' });

    expect(mexican.items[0].prices).toEqual([
      { currency: 'MXN', period: 'monthly', amountCents: 19_900 },
    ]);
  });

  it('omite el plan que no se vende en la moneda pedida', async () => {
    await seedPaidPlan(
      'individual',
      { public: true, name: 'Individual', kind: 'paid' },
      2_900,
      'USD',
    );

    await expect(
      controller().listPublicPlans({ currency: 'MXN' }),
    ).resolves.toMatchObject({ items: [] });
  });

  it('cachea por moneda: una divisa no contamina la respuesta de otra', async () => {
    await seedPaidPlan(
      'individual',
      { public: true, name: 'Individual', kind: 'paid' },
      19_900,
      'MXN',
    );
    const subject = controller('hosted', () => 1_000);

    const mexican = await subject.listPublicPlans({ currency: 'MXN' });
    const american = await subject.listPublicPlans({ currency: 'USD' });

    expect(mexican.items).toHaveLength(1);
    expect(american.items).toHaveLength(0);
  });

  it('sirve de caché dentro de la ventana y vuelve a consultar al expirar', async () => {
    await seedPaidPlan('individual', {
      public: true,
      name: 'Individual',
      kind: 'paid',
    });
    let now = 1_000;
    const subject = controller('hosted', () => now);

    await expect(subject.listPublicPlans({})).resolves.toMatchObject({
      items: [expect.objectContaining({ code: 'individual' })],
    });

    // Un cambio en la base DENTRO de la ventana no se ve: es el precio que se
    // paga por no tocar PostgreSQL en cada visita anónima.
    await seedPaidPlan('despacho', {
      public: true,
      name: 'Despacho',
      kind: 'paid',
    });
    now += 59_000;
    await expect(subject.listPublicPlans({})).resolves.toMatchObject({
      items: [expect.objectContaining({ code: 'individual' })],
    });

    // Pasada la ventana, el catálogo vuelve a leerse entero.
    now += 2_000;
    const refreshed = await subject.listPublicPlans({});
    expect(refreshed.items.map((item) => item.code).sort()).toEqual([
      'despacho',
      'individual',
    ]);
  });

  it('degrada seatsMinimum absurdo a 1 en vez de propagarlo al contrato', async () => {
    await seedPaidPlan('individual', {
      public: true,
      name: 'Individual',
      kind: 'paid',
      seatsMinimum: -7,
    });

    const [plan] = (await controller().listPublicPlans({})).items;

    expect(plan.seatsMinimum).toBe(1);
  });
});
