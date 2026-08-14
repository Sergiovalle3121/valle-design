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

    // Mismo catálogo que siembran las migraciones: trial + plan vendible,
    // ambos con el único entitlement del producto.
    for (const plan of [
      {
        code: STANDALONE_TRIAL_PLAN_CODE,
        metadata: { kind: 'trial', pricePublished: false },
      },
      {
        code: STANDALONE_FULL_PLAN_CODE,
        metadata: { kind: 'paid', pricePublished: false },
      },
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
    if (!sellable) return;
    await manager
      .getRepository(PlanPrice)
      .createQueryBuilder()
      .insert()
      .values({ ...SAMPLE_PLAN_PRICE, active: true })
      .orIgnore()
      .execute();
  }
}
