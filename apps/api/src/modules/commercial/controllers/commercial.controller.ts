import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user.types';
import {
  PlanCatalog,
  PlanEntitlement,
  Subscription,
} from '../entities/commercial.entities';

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

interface CommercialSnapshot {
  organizationId: string | null;
  subscription: {
    planCode: string;
    status: string;
    trialEndsAt: Date | null;
    effective: boolean;
  } | null;
  entitlements: string[];
}

/**
 * Read-only commercial state for the active first-party organization.
 * Organization and tenant identifiers are accepted only from the server-side
 * session context populated by CadAuthGuard.
 */
@Controller('v1/commercial')
export class CommercialController {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(PlanCatalog)
    private readonly plans: Repository<PlanCatalog>,
    @InjectRepository(PlanEntitlement)
    private readonly planEntitlements: Repository<PlanEntitlement>,
  ) {}

  @Get('subscription')
  async subscription(@Req() request: AuthenticatedRequest) {
    const snapshot = await this.snapshot(request);
    return {
      organizationId: snapshot.organizationId,
      subscription: snapshot.subscription,
    };
  }

  @Get('entitlements')
  async entitlements(@Req() request: AuthenticatedRequest) {
    const snapshot = await this.snapshot(request);
    return {
      organizationId: snapshot.organizationId,
      items: snapshot.entitlements,
    };
  }

  private async snapshot(
    request: AuthenticatedRequest,
  ): Promise<CommercialSnapshot> {
    if (!request.user) {
      throw new UnauthorizedException('Falta una sesión válida.');
    }
    const organizationId = request.user.organization_id;
    const tenantId = request.user.tenant_id;
    if (!organizationId || tenantId !== organizationId) {
      return { organizationId: null, subscription: null, entitlements: [] };
    }

    const subscription = await this.subscriptions.findOneBy({
      organizationId,
      tenantId,
    });
    if (!subscription) {
      return { organizationId, subscription: null, entitlements: [] };
    }

    const plan = await this.plans.findOneBy({ code: subscription.planCode });
    const now = new Date();
    const effective =
      !!plan?.active &&
      (subscription.status === 'active' ||
        (subscription.status === 'trialing' &&
          !!subscription.trialEndsAt &&
          subscription.trialEndsAt > now));
    const entitlements = effective
      ? (
          await this.planEntitlements.find({
            where: { planCode: subscription.planCode },
            order: { entitlementCode: 'ASC' },
            take: 200,
          })
        ).map((entry) => entry.entitlementCode)
      : [];

    return {
      organizationId,
      subscription: {
        planCode: subscription.planCode,
        status: subscription.status,
        trialEndsAt: subscription.trialEndsAt,
        effective,
      },
      entitlements,
    };
  }
}
