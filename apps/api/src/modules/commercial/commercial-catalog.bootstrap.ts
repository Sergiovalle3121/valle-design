import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { DESIGN_CAD_ENTITLEMENT } from '@valle-design/contracts';
import { DataSource } from 'typeorm';
import { PlanCatalog, PlanEntitlement } from './entities/commercial.entities';

export const STANDALONE_TRIAL_PLAN_CODE = 'standalone-trial';
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
    // Production catalog rows belong exclusively to reviewed migrations or an
    // operator workflow. Missing/inactive rows remain unavailable and are
    // surfaced by OrganizationsController instead of being recreated here.
    if (process.env.NODE_ENV === 'production') return;
    await this.database.transaction(async (manager) => {
      if ((await manager.count(PlanCatalog)) !== 0) return;

      await manager
        .getRepository(PlanCatalog)
        .createQueryBuilder()
        .insert()
        .values({
          code: STANDALONE_TRIAL_PLAN_CODE,
          active: true,
          metadata: { kind: 'trial', pricePublished: false },
        })
        .orIgnore()
        .execute();
      const trial = await manager.findOneBy(PlanCatalog, {
        code: STANDALONE_TRIAL_PLAN_CODE,
      });
      if (!trial) return;
      await manager
        .getRepository(PlanEntitlement)
        .createQueryBuilder()
        .insert()
        .values({
          planCode: STANDALONE_TRIAL_PLAN_CODE,
          entitlementCode: STANDALONE_CAD_ENTITLEMENT,
        })
        .orIgnore()
        .execute();
    });
  }
}
