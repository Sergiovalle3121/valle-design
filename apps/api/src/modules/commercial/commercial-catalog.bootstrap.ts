import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { DESIGN_CAD_ENTITLEMENT } from '@valle-design/contracts';
import { DataSource } from 'typeorm';
import { PlanCatalog, PlanEntitlement } from './entities/commercial.entities';

export const STANDALONE_TRIAL_PLAN_CODE = 'standalone-trial';
/**
 * Plan vendible al que un upgrade confirmado mueve la suscripción. Sin precio:
 * PlanCatalog no publica precios y no hay pasarela — el cobro ocurre fuera del
 * producto y lo confirma un owner/admin (subscription_upgrade_intents).
 */
export const STANDALONE_FULL_PLAN_CODE = 'standalone-full';
export const STANDALONE_CAD_ENTITLEMENT = DESIGN_CAD_ENTITLEMENT;

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
    });
  }
}
