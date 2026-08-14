import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.types';
import { NullPaymentProvider } from './adapters/null-payment.provider';
import { CommercialController } from './controllers/commercial.controller';
import {
  PlanCatalog,
  PlanEntitlement,
  PlanPrice,
  Subscription,
  SubscriptionUpgradeIntent,
} from './entities/commercial.entities';
import type { CadEventPublisher } from './ports/commercial.ports';
import type { SubscriptionLifecycleService } from './subscription-lifecycle.service';

/**
 * GET /v1/commercial/plans sobre datos reales (SQLite): qué se publica y qué
 * se calla. La semántica del índice único parcial vive en la suite PostgreSQL;
 * aquí se fija la FORMA del catálogo publicado.
 */
describe('CommercialController plans (catálogo publicado)', () => {
  let database: DataSource;
  let controller: CommercialController;

  beforeEach(async () => {
    database = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [PlanCatalog, PlanEntitlement, PlanPrice],
      synchronize: true,
    });
    await database.initialize();
    controller = new CommercialController(
      // El endpoint de catálogo no toca suscripciones, intents, transacciones
      // ni eventos: los stubs vacíos garantizan que siga siendo así.
      {} as Repository<Subscription>,
      database.getRepository(PlanCatalog),
      database.getRepository(PlanEntitlement),
      database.getRepository(PlanPrice),
      {} as Repository<SubscriptionUpgradeIntent>,
      {} as DataSource,
      {} as SubscriptionLifecycleService,
      {} as CadEventPublisher,
      new NullPaymentProvider(),
    );
  });

  afterEach(async () => {
    if (database.isInitialized) await database.destroy();
  });

  function request(user?: Partial<AuthenticatedUser>): Request {
    return { user } as unknown as Request;
  }

  function sessionWithoutOrganization(): Request {
    return request({
      userId: 'user-1',
      email: 'never-published@example.test',
      role: '',
      tenant_id: null,
      organization_id: null,
    });
  }

  it('exige sesión: sin usuario autenticado responde 401', async () => {
    await expect(controller.listPlans(request(undefined))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('publica solo planes activos con sus precios activos, ordenados', async () => {
    await database.getRepository(PlanCatalog).save([
      {
        code: 'standalone-trial',
        active: true,
        metadata: { kind: 'trial', name: 'Prueba gratuita' },
      },
      { code: 'standalone-full', active: true, metadata: { kind: 'paid' } },
      { code: 'plan-retirado', active: false, metadata: null },
    ]);
    await database.getRepository(PlanEntitlement).save([
      { planCode: 'standalone-full', entitlementCode: 'design.cad' },
      { planCode: 'standalone-trial', entitlementCode: 'design.cad' },
    ]);
    await database.getRepository(PlanPrice).save([
      {
        planCode: 'standalone-full',
        currency: 'USD',
        period: 'yearly',
        amountCents: 29900,
        active: true,
      },
      {
        planCode: 'standalone-full',
        currency: 'USD',
        period: 'monthly',
        amountCents: 2900,
        active: true,
      },
      {
        planCode: 'standalone-full',
        currency: 'EUR',
        period: 'monthly',
        amountCents: 2700,
        active: true,
      },
      // Precio histórico desactivado: jamás se publica.
      {
        planCode: 'standalone-full',
        currency: 'USD',
        period: 'monthly',
        amountCents: 1900,
        active: false,
      },
      // Precio de un plan retirado: tampoco.
      {
        planCode: 'plan-retirado',
        currency: 'USD',
        period: 'monthly',
        amountCents: 100,
        active: true,
      },
    ]);

    const published = await controller.listPlans(sessionWithoutOrganization());
    expect(published).toEqual({
      // Derivado del descriptor del NullPaymentProvider, no una constante.
      checkout: 'external',
      items: [
        {
          code: 'standalone-full',
          // Sin metadata.name, el código ES el nombre publicado.
          name: 'standalone-full',
          entitlements: ['design.cad'],
          prices: [
            { currency: 'EUR', period: 'monthly', amountCents: 2700 },
            { currency: 'USD', period: 'monthly', amountCents: 2900 },
            { currency: 'USD', period: 'yearly', amountCents: 29900 },
          ],
        },
        {
          code: 'standalone-trial',
          name: 'Prueba gratuita',
          entitlements: ['design.cad'],
          // Un plan sin precio publicado lista prices vacío, no desaparece.
          prices: [],
        },
      ],
    });
    // Céntimos como número JSON, nunca string del driver.
    for (const price of published.items[0].prices) {
      expect(typeof price.amountCents).toBe('number');
    }
  });

  it('con el catálogo vacío responde el sobre completo, sin tocar precios', async () => {
    await expect(
      controller.listPlans(sessionWithoutOrganization()),
    ).resolves.toEqual({ checkout: 'external', items: [] });
  });
});
