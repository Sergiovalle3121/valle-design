import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { DESIGN_CAD_ENTITLEMENT } from '@valle-design/contracts';
import { DataSource, EntityManager } from 'typeorm';
import {
  PlanCatalog,
  PlanEntitlement,
  PlanPrice,
} from './entities/commercial.entities';

export const STANDALONE_TRIAL_PLAN_CODE = 'standalone-trial';
/**
 * Plan vendible al que un upgrade confirmado mueve la suscripción. Su precio
 * vive en `plan_prices` (P3 ola 1); el COBRO sigue ocurriendo fuera del
 * producto y lo confirma un owner/admin (subscription_upgrade_intents) — no
 * hay pasarela todavía.
 */
export const STANDALONE_FULL_PLAN_CODE = 'standalone-full';
export const STANDALONE_CAD_ENTITLEMENT = DESIGN_CAD_ENTITLEMENT;

/**
 * Asientos del trial de 14 días.
 *
 * Tres y no uno: lo que diferencia a este producto de AutoCAD Web es trabajar
 * sobre el mismo documento con el equipo, y un trial de un solo asiento hace
 * literalmente imposible probar eso. Tres tampoco es un Despacho gratis —el
 * plan de despacho arranca justo en tres asientos y dura para siempre; el
 * trial dura dos semanas—, así que el límite corta el abuso sin cortar la
 * evaluación.
 */
export const TRIAL_SEATS = 3;

/** Planes publicables de la oferta mexicana (ver 20260816120000). */
export const INDIVIDUAL_PLAN_CODE = 'individual';
export const DESPACHO_PLAN_CODE = 'despacho';

/**
 * Precio de EJEMPLO que se siembra sólo fuera de producción, y sobre el plan
 * VENDIBLE (`standalone-full`): el trial del piloto es gratuito por
 * definición, así que ponerle precio publicaría una mentira. En producción los
 * precios llegan por migración revisada u operador (ver la migración
 * 20260814100000-PlanPrices); este bootstrap jamás los toca allí.
 */
export const SAMPLE_PLAN_PRICE = {
  planCode: STANDALONE_FULL_PLAN_CODE,
  currency: 'USD',
  period: 'monthly',
  amountCents: 2900,
} as const;

/**
 * Oferta publicable, IDÉNTICA a la que siembra la migración mexicana.
 *
 * Se duplica aquí a propósito, y no se importa de la migración, porque una
 * migración es un hecho histórico congelado: cuando dentro de un año el precio
 * cambie por otra migración, ESTA constante se actualizará al precio vigente y
 * aquella conservará el que fue. Compartir la constante haría que reescribir el
 * precio de hoy reescribiese también el pasado.
 *
 * Un desarrollador con base efímera (SQLite + synchronize, sin migraciones)
 * necesita ver la misma página de precios que un cliente; si aquí sólo
 * viviera el ejemplo de 29 USD, la página de precios local publicaría una
 * moneda que el producto no cobra.
 */
export const PUBLISHABLE_PLANS = [
  {
    code: INDIVIDUAL_PLAN_CODE,
    metadata: {
      kind: 'paid',
      public: true,
      name: 'Individual',
      perSeat: false,
      seatsMinimum: 1,
      taxIncluded: true,
    },
    prices: [
      { currency: 'MXN', period: 'monthly', amountCents: 19_900 },
      { currency: 'MXN', period: 'yearly', amountCents: 199_000 },
    ],
  },
  {
    code: DESPACHO_PLAN_CODE,
    metadata: {
      kind: 'paid',
      public: true,
      name: 'Despacho',
      perSeat: true,
      seatsMinimum: 3,
      taxIncluded: true,
    },
    prices: [
      { currency: 'MXN', period: 'monthly', amountCents: 16_900 },
      { currency: 'MXN', period: 'yearly', amountCents: 169_000 },
    ],
  },
] as const;

/** Presentación del trial: publicable y sin precio, porque es gratuito. */
const TRIAL_PRESENTATION = {
  kind: 'trial',
  pricePublished: false,
  public: true,
  name: 'Prueba',
  perSeat: false,
  seatsMinimum: 1,
  taxIncluded: true,
} as const;

/**
 * Development `synchronize` databases have no migration seed. Bootstrap the
 * built-in catalog only when the catalog is completely empty. An existing,
 * inactive or partial catalog is configuration owned by operators and is
 * never repaired/reactivated implicitly.
 */
@Injectable()
export class CommercialCatalogBootstrap implements OnApplicationBootstrap {
  constructor(private readonly database: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    // Production catalog rows belong exclusively to reviewed migrations
    // (CommercialFoundation + CommercialSellableCatalog) or an operator
    // workflow. Missing/inactive rows remain unavailable and are surfaced by
    // OrganizationsController instead of being recreated here.
    if (process.env.NODE_ENV === 'production') return;
    await this.database.transaction(async (manager) => {
      await this.seedCatalog(manager);
      await this.seedSamplePrice(manager);
    });
  }

  private async seedCatalog(manager: EntityManager): Promise<void> {
    if ((await manager.count(PlanCatalog)) !== 0) return;

    // Mismo catálogo que siembran las migraciones: trial + plan vendible
    // heredado + la oferta publicable, todos con el único entitlement del
    // producto. `standalone-full` NO es publicable: existe para el flujo
    // heredado de upgrade-intents, no es una oferta que se anuncie.
    for (const plan of [
      {
        code: STANDALONE_TRIAL_PLAN_CODE,
        metadata: { ...TRIAL_PRESENTATION },
      },
      {
        code: STANDALONE_FULL_PLAN_CODE,
        metadata: { kind: 'paid', pricePublished: false },
      },
      ...PUBLISHABLE_PLANS.map((plan) => ({
        code: plan.code,
        metadata: { ...plan.metadata },
      })),
    ]) {
      await manager
        .getRepository(PlanCatalog)
        .createQueryBuilder()
        .insert()
        .values({ code: plan.code, active: true, metadata: plan.metadata })
        .orIgnore()
        .execute();
      const persisted = await manager.findOneBy(PlanCatalog, {
        code: plan.code,
      });
      if (!persisted) continue;
      await manager
        .getRepository(PlanEntitlement)
        .createQueryBuilder()
        .insert()
        .values({
          planCode: plan.code,
          entitlementCode: STANDALONE_CAD_ENTITLEMENT,
        })
        .orIgnore()
        .execute();
    }
  }

  /**
   * Guardia independiente de la del catálogo: una tabla de precios NO vacía es
   * configuración del operador (precios propios, o precios apagados adrede) y
   * no se repara ni completa. Sólo una tabla completamente vacía, con el plan
   * vendible presente, recibe el precio de ejemplo — así GET /plans tiene algo
   * que publicar en desarrollo sin tocar la base a mano.
   */
  private async seedSamplePrice(manager: EntityManager): Promise<void> {
    if ((await manager.count(PlanPrice)) !== 0) return;
    const sellable = await manager.findOneBy(PlanCatalog, {
      code: SAMPLE_PLAN_PRICE.planCode,
    });
    if (sellable) {
      await manager
        .getRepository(PlanPrice)
        .createQueryBuilder()
        .insert()
        .values({ ...SAMPLE_PLAN_PRICE, active: true })
        .orIgnore()
        .execute();
    }
    // Los precios de la oferta publicable viajan bajo la MISMA guardia de
    // tabla vacía: o el bootstrap siembra el catálogo entero, o no toca nada.
    // Sembrarlos por separado dejaría medio catálogo con precio y medio sin
    // él ante cualquier fila preexistente.
    for (const plan of PUBLISHABLE_PLANS) {
      const persisted = await manager.findOneBy(PlanCatalog, {
        code: plan.code,
      });
      if (!persisted) continue;
      for (const price of plan.prices) {
        await manager
          .getRepository(PlanPrice)
          .createQueryBuilder()
          .insert()
          .values({ planCode: plan.code, ...price, active: true })
          .orIgnore()
          .execute();
      }
    }
  }
}
