import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FIRST_PARTY_AUTH_ENTITY_GRAPH } from '../../common/testing/first-party-cad-auth';
import { NullPaymentProvider } from './adapters/null-payment.provider';
import { StripePaymentProvider } from './adapters/stripe-payment.provider';
import { CommercialModule } from './commercial.module';
import { BillingController } from './controllers/billing.controller';
import { CommercialController } from './controllers/commercial.controller';
import { PAYMENT_PROVIDER } from './ports/payment-provider.port';

/**
 * El puerto de pagos es una PROMESA ESTRUCTURAL: existe el enchufe, el
 * adaptador por defecto dice la verdad (no hay pasarela) y el adaptador real se
 * elige por CONFIGURACIÓN. Estas pruebas fijan las tres cosas, porque el modo
 * de fallo caro no es «Stripe no funciona» sino «el despliegue creía tener
 * pasarela y no la tenía» — o al revés.
 */

const STRIPE_ENV = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CHECKOUT_SUCCESS_URL',
  'STRIPE_CHECKOUT_CANCEL_URL',
] as const;

describe('NullPaymentProvider (adaptador sin pasarela)', () => {
  const provider = new NullPaymentProvider();

  it('se describe como cobro externo y NO disponible', () => {
    expect(provider.descriptor()).toEqual({
      name: 'null',
      mode: 'external',
      available: false,
    });
  });

  it('nunca crea un checkout: responde unavailable apuntando a upgrade-intents', async () => {
    const result = await provider.createCheckout();
    expect(result.kind).toBe('unavailable');
    if (result.kind !== 'unavailable') throw new Error('inalcanzable');
    // La razón debe contarle al llamador el camino REAL del cobro del piloto.
    expect(result.reason).toContain('upgrade-intents');
    expect(result.reason).toContain('externo');
  });

  it('tampoco programa bajas: apunta al operador en vez de fingir', async () => {
    const result = await provider.cancelAtPeriodEnd();
    expect(result.kind).toBe('unavailable');
    if (result.kind !== 'unavailable') throw new Error('inalcanzable');
    expect(result.reason).toContain('operador');
  });

  it('jamás verifica webhooks: sin pasarela no hay emisor legítimo', async () => {
    await expect(provider.verifyWebhook()).rejects.toThrow(
      /no verifica webhooks/,
    );
  });
});

describe('cableado del puerto de pagos (grafo real de CommercialModule)', () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of STRIPE_ENV) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    saved.clear();
  });

  async function compile() {
    return Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          dropSchema: true,
          synchronize: true,
          autoLoadEntities: true,
          entities: [...FIRST_PARTY_AUTH_ENTITY_GRAPH],
        }),
        CommercialModule,
      ],
    }).compile();
  }

  it('SIN configuración de Stripe resuelve el adaptador nulo y alimenta a los controllers', async () => {
    const moduleRef = await compile();
    try {
      const bound: unknown = moduleRef.get(PAYMENT_PROVIDER);
      expect(bound).toBeInstanceOf(NullPaymentProvider);
      // Los controllers inyectan el MISMO binding: si el token se descablea,
      // el catálogo publicado dejaría de derivar su modo de checkout del
      // puerto y la compra hablaría con otro proveedor que el catálogo.
      const commercial: { payments?: unknown } =
        moduleRef.get(CommercialController);
      expect(commercial.payments).toBe(bound);
      const billing: { payments?: unknown } = moduleRef.get(BillingController);
      expect(billing.payments).toBe(bound);
    } finally {
      await moduleRef.close();
    }
  });

  it('CON la configuración completa resuelve el adaptador de Stripe', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_WEBHOOK_SECRET =
      'whsec_prueba_de_treinta_y_dos_caracteres';
    process.env.STRIPE_CHECKOUT_SUCCESS_URL = 'https://app.example.test/ok';
    process.env.STRIPE_CHECKOUT_CANCEL_URL = 'https://app.example.test/ko';

    const moduleRef = await compile();
    try {
      const bound: unknown = moduleRef.get(PAYMENT_PROVIDER);
      expect(bound).toBeInstanceOf(StripePaymentProvider);
      expect((bound as StripePaymentProvider).descriptor()).toEqual({
        name: 'stripe',
        mode: 'hosted',
        available: true,
      });
    } finally {
      await moduleRef.close();
    }
  });

  it('con configuración A MEDIAS el módulo NO arranca: jamás un cobro sin confirmación', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    // Falta el resto: podría cobrar y no enterarse de que cobró.
    await expect(compile()).rejects.toThrow(/incompleta/);
  });
});
