import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { DataSource, In, Repository } from 'typeorm';
import { isUniqueViolation } from '../../../common/database/unique-violation';
import {
  PlanCatalog,
  PlanEntitlement,
  PlanPrice,
  Subscription,
  SubscriptionUpgradeIntent,
} from '../entities/commercial.entities';
import {
  CAD_EVENT_PUBLISHER,
  type CadEventPublisher,
} from '../ports/commercial.ports';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../ports/payment-provider.port';
import { SubscriptionLifecycleService } from '../subscription-lifecycle.service';
import {
  type AuthenticatedRequest,
  requireDecider,
  requireMember,
} from './commercial-request-context';

interface CommercialSnapshot {
  organizationId: string | null;
  subscription: {
    planCode: string;
    status: string;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    effective: boolean;
  } | null;
  entitlements: string[];
}

class UpgradeIntentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  requestedPlanCode!: string;
}

/** Vista contractual de un precio publicado: céntimos enteros, sin fechas. */
interface CommercialPlanPriceView {
  currency: string;
  period: string;
  amountCents: number;
}

interface CommercialPlanView {
  code: string;
  name: string;
  entitlements: string[];
  prices: CommercialPlanPriceView[];
}

/** Nombre publicable del plan: metadata.name del operador, o el código. */
function readPlanName(plan: PlanCatalog): string {
  const name = (plan.metadata as { name?: unknown } | null)?.name;
  return typeof name === 'string' && name.trim() ? name : plan.code;
}

/** Vista contractual del intent: identificadores y estado, jamás correos. */
function intentView(intent: SubscriptionUpgradeIntent) {
  return {
    id: intent.id,
    organizationId: intent.organizationId,
    requestedPlanCode: intent.requestedPlanCode,
    status: intent.status,
    requestedByUserId: intent.requestedByUserId,
    decidedByUserId: intent.decidedByUserId,
    decidedAt: intent.decidedAt,
    createdAt: intent.createdAt,
  };
}

/**
 * Estado comercial de la organización activa + checkout SIN pasarela.
 *
 * Lecturas: organización y tenant se aceptan sólo del contexto server-side
 * que puebla CadAuthGuard. La lectura comercial es además el punto donde se
 * asienta la transición perezosa del trial vencido (ver
 * SubscriptionLifecycleService para el porqué de perezosa y de `suspended`).
 *
 * Upgrade: sin proveedor de pagos no hay cobro dentro del producto; hay un
 * INTENT auditable. Cualquier miembro de la organización lo registra; sólo
 * owner/admin lo confirma (tras el cobro externo) o lo cancela, y la
 * confirmación mueve la suscripción al plan pedido con estado `active` en la
 * misma transacción que decide el intent.
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
    @InjectRepository(PlanPrice)
    private readonly planPrices: Repository<PlanPrice>,
    @InjectRepository(SubscriptionUpgradeIntent)
    private readonly upgradeIntents: Repository<SubscriptionUpgradeIntent>,
    private readonly data: DataSource,
    private readonly lifecycle: SubscriptionLifecycleService,
    @Inject(CAD_EVENT_PUBLISHER)
    private readonly events: CadEventPublisher,
    @Inject(PAYMENT_PROVIDER)
    private readonly payments: PaymentProvider,
  ) {}

  /**
   * Catálogo PUBLICADO: planes activos con sus precios activos.
   *
   * Es información global del producto (ningún dato por organización), así que
   * basta una sesión autenticada — mismo guard pattern que GET subscription:
   * CadAuthGuard puebla `req.user` y aquí sólo se exige su presencia, sin
   * requerir organización activa. `checkout` se deriva del descriptor del
   * proveedor de pagos: hoy `external` (adaptador nulo — el cobro es
   * externo/asistido vía upgrade-intents), y cuando la ola 2 enchufe una
   * pasarela este mismo campo lo contará sin tocar el resto de la respuesta.
   */
  @Get('plans')
  async listPlans(@Req() request: AuthenticatedRequest): Promise<{
    checkout: string;
    items: CommercialPlanView[];
  }> {
    if (!request.user) {
      throw new UnauthorizedException('Falta una sesión válida.');
    }
    const plans = await this.plans.find({
      where: { active: true },
      order: { code: 'ASC' },
      take: 200,
    });
    const codes = plans.map((plan) => plan.code);
    const [entitlements, prices] = codes.length
      ? await Promise.all([
          this.planEntitlements.find({
            where: { planCode: In(codes) },
            order: { entitlementCode: 'ASC' },
            take: 200,
          }),
          this.planPrices.find({
            where: { planCode: In(codes), active: true },
            order: { currency: 'ASC', period: 'ASC' },
            take: 200,
          }),
        ])
      : [[], []];
    return {
      checkout: this.payments.descriptor().mode,
      items: plans.map((plan) => ({
        code: plan.code,
        // El catálogo no persiste un nombre comercial; si el operador lo dejó
        // en metadata.name se publica, y si no, el código ES el nombre. Nada
        // más del metadata sale al contrato.
        name: readPlanName(plan),
        entitlements: entitlements
          .filter((entry) => entry.planCode === plan.code)
          .map((entry) => entry.entitlementCode),
        prices: prices
          .filter((price) => price.planCode === plan.code)
          .map((price) => ({
            currency: price.currency,
            period: price.period,
            // bigint llega como string desde PostgreSQL; el contrato publica
            // céntimos como entero JSON.
            amountCents: Number(price.amountCents),
          })),
      })),
    };
  }

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

  @Get('upgrade-intents')
  async listUpgradeIntents(@Req() request: AuthenticatedRequest) {
    const { organizationId } = requireDecider(request);
    const items = await this.upgradeIntents.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return { organizationId, items: items.map(intentView) };
  }

  @Post('upgrade-intents')
  async createUpgradeIntent(
    @Body() body: UpgradeIntentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { user, organizationId } = requireMember(request);
    try {
      return await this.data.transaction(async (manager) => {
        const plan = await manager.findOneBy(PlanCatalog, {
          code: body.requestedPlanCode,
        });
        // Un trial no se compra: el intent sólo apunta a planes vendibles y
        // activos. Un plan sin `kind` es configuración del operador y se
        // considera vendible.
        if (
          !plan?.active ||
          (plan.metadata as { kind?: string } | null)?.kind === 'trial'
        ) {
          throw new BadRequestException({
            code: 'plan_unavailable',
            message: 'El plan solicitado no está disponible para upgrade.',
          });
        }
        const current = await manager.findOneBy(Subscription, {
          organizationId,
          tenantId: organizationId,
        });
        if (current?.planCode === plan.code && current.status === 'active') {
          throw new ConflictException({
            code: 'plan_already_active',
            message: 'La organización ya tiene ese plan activo.',
          });
        }
        const intent = await manager.save(
          SubscriptionUpgradeIntent,
          manager.create(SubscriptionUpgradeIntent, {
            organizationId,
            tenantId: organizationId,
            requestedPlanCode: plan.code,
            status: 'pending',
            requestedByUserId: user.userId,
            decidedByUserId: null,
            decidedAt: null,
          }),
        );
        return intentView(intent);
      });
    } catch (error) {
      // El índice único parcial es el árbitro real bajo carrera; aquí sólo se
      // traduce a la respuesta contractual.
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'upgrade_intent_pending',
          message: 'Ya existe un intent de upgrade pendiente de decisión.',
        });
      }
      throw error;
    }
  }

  @Post('upgrade-intents/:intentId/confirm')
  async confirmUpgradeIntent(
    @Param('intentId', new ParseUUIDPipe({ version: '4' })) intentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const { user, organizationId } = requireDecider(request);
    return this.data.transaction(async (manager) => {
      const intent = await this.decideIntent(
        manager.getRepository(SubscriptionUpgradeIntent),
        intentId,
        organizationId,
        'confirmed',
        user.userId,
      );
      const plan = await manager.findOneBy(PlanCatalog, {
        code: intent.requestedPlanCode,
      });
      // El plan pudo desactivarse entre el intent y la confirmación; el throw
      // deshace también la decisión del intent (misma transacción).
      if (!plan?.active) {
        throw new ConflictException({
          code: 'plan_unavailable',
          message: 'El plan solicitado ya no está disponible.',
        });
      }
      const applied = await manager.update(
        Subscription,
        { organizationId, tenantId: organizationId },
        { planCode: plan.code, status: 'active', trialEndsAt: null },
      );
      if (!applied.affected) {
        // Organización provisionada sin fila de suscripción: la confirmación
        // la crea — el resultado observable es el mismo, plan activo.
        await manager.insert(Subscription, {
          organizationId,
          tenantId: organizationId,
          planCode: plan.code,
          status: 'active',
          trialEndsAt: null,
        });
      }
      const subscription = await manager.findOneByOrFail(Subscription, {
        organizationId,
        tenantId: organizationId,
      });
      await this.events.publish(
        {
          organizationId,
          tenantId: organizationId,
          type: 'commercial.subscription.upgraded',
          aggregateId: subscription.id,
          payload: { planCode: plan.code, intentId: intent.id },
          idempotencyKey: `upgrade-intent-confirmed:${intent.id}`,
        },
        { native: manager },
      );
      return {
        intent: intentView(intent),
        subscription: {
          planCode: subscription.planCode,
          status: subscription.status,
          trialEndsAt: subscription.trialEndsAt,
        },
      };
    });
  }

  @Post('upgrade-intents/:intentId/cancel')
  async cancelUpgradeIntent(
    @Param('intentId', new ParseUUIDPipe({ version: '4' })) intentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const { user, organizationId } = requireDecider(request);
    return this.data.transaction(async (manager) => {
      const intent = await this.decideIntent(
        manager.getRepository(SubscriptionUpgradeIntent),
        intentId,
        organizationId,
        'cancelled',
        user.userId,
      );
      return intentView(intent);
    });
  }

  /**
   * Decisión atómica del intent: sólo la transición `pending` → decidido
   * afecta filas, así dos deciders concurrentes no pueden pisarse y un intent
   * ya decidido responde el 409 contractual en vez de re-decidirse.
   */
  private async decideIntent(
    repository: Repository<SubscriptionUpgradeIntent>,
    intentId: string,
    organizationId: string,
    decision: 'confirmed' | 'cancelled',
    decidedByUserId: string,
  ): Promise<SubscriptionUpgradeIntent> {
    const result = await repository.update(
      { id: intentId, organizationId, status: 'pending' },
      { status: decision, decidedByUserId, decidedAt: new Date() },
    );
    if (!result.affected) {
      // Distingue «no existe / de otra organización» (404 fail-closed, sin
      // filtrar existencia ajena) de «ya decidido» (409).
      const existing = await repository.findOneBy({
        id: intentId,
        organizationId,
      });
      if (!existing) {
        throw new NotFoundException('Intent de upgrade no encontrado.');
      }
      throw new ConflictException({
        code: 'upgrade_intent_not_pending',
        message: `El intent ya fue decidido (${existing.status}).`,
      });
    }
    return repository.findOneByOrFail({ id: intentId });
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

    // Transición perezosa: la lectura comercial es el punto de sincronía del
    // trial vencido (los guards ya fallan cerrado por fecha sin escribir).
    await this.lifecycle.settleExpiredTrial(organizationId, tenantId);

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
        // Ola 2: hasta cuándo está pagado y si ya hay baja programada. Null y
        // false son la respuesta honesta mientras el cobro sea externo.
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        effective,
      },
      entitlements,
    };
  }
}
