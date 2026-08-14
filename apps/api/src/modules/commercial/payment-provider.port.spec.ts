import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FIRST_PARTY_AUTH_ENTITY_GRAPH } from '../../common/testing/first-party-cad-auth';
import { NullPaymentProvider } from './adapters/null-payment.provider';
import { CommercialModule } from './commercial.module';
import { CommercialController } from './controllers/commercial.controller';
import { PAYMENT_PROVIDER } from './ports/payment-provider.port';

/**
 * El puerto de pagos de la ola 1 es una PROMESA ESTRUCTURAL: existe el enchufe
 * y el adaptador por defecto dice la verdad — no hay pasarela. Estas pruebas
 * fijan esa verdad para que la ola 2 (Stripe) sólo tenga que sustituir el
 * binding, no re-negociar el contrato.
 */
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

  it('jamás verifica webhooks: sin pasarela no hay emisor legítimo', async () => {
    await expect(provider.verifyWebhook()).rejects.toThrow(
      /no verifica webhooks/,
    );
  });
});

describe('cableado del puerto de pagos (grafo real de CommercialModule)', () => {
  it('PAYMENT_PROVIDER resuelve al adaptador nulo y alimenta al controller', async () => {
    const moduleRef = await Test.createTestingModule({
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
    try {
      const bound: unknown = moduleRef.get(PAYMENT_PROVIDER);
      expect(bound).toBeInstanceOf(NullPaymentProvider);
      // El controller inyecta el MISMO binding: si el token se descablea, el
      // catálogo publicado dejaría de derivar su modo de checkout del puerto.
      const controller: { payments?: unknown } =
        moduleRef.get(CommercialController);
      expect(controller.payments).toBe(bound);
    } finally {
      await moduleRef.close();
    }
  });
});
