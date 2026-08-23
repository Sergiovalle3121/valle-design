import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
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

/**
 * Pago ASÍNCRONO en curso. Existe para que la interfaz pueda decir qué se está
 * esperando: entre pedir una ficha de OXXO y que el dinero llegue pasan horas
 * o días, y una pantalla que sólo diga «sin suscripción activa» durante ese
 * tiempo empuja al cliente a pagar otra vez.
 */
interface PendingPaymentView {
  method: string;
  since: Date;
  voucherUrl: string | null;
  planCode: string;
}

interface CommercialSnapshot {
  organizationId: string | null;
  subscription: {
    planCode: string;
    status: string;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    seats: number;
    effective: boolean;
  } | null;
  pendingPayment: PendingPaymentView | null;
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
 * INTENT auditable. Cualquier miembro de la organización lo registra y
 * owner/admin lo cancela. La CONFIRMACIÓN manual está retirada (P0-A,
 * 2026-08-23): activaba la suscripción sin cobro verificado y el único
 * llamador posible era la propia organización cliente confirmándose a sí
 * misma. Ver el comentario de `confirmUpgradeIntent`. La activación real
 * llega por `BillingWebhookService` desde un webhook firmado del proveedor
 * de pagos (ADR-0006).
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
      pendingPayment: snapshot.pendingPayment,
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

  /**
   * RETIRADO (P0-A, campaña de seguridad 2026-08-23): esta ruta activaba la
   * suscripción con `status: 'active'` sin pasar nunca por un proveedor de
   * pago ni por un webhook firmado. `organizationId` SIEMPRE se deriva de la
   * membresía activa de quien llama (ADR-0005) — nunca del cliente — así que
   * el único principal que podía alcanzar este método era un owner/admin de
   * la MISMA organización cliente que pidió el upgrade: exactamente el actor
   * que jamás debe poder concederse a sí mismo un plan pagado. Este sistema
   * no tiene hoy un principal interno (staff/operaciones) distinto de los
   * miembros de organización cliente, así que no existe ningún llamador
   * legítimo para esta ruta y se retira en vez de dejarla alcanzable.
   *
   * La activación real para despliegues con pasarela llega por
   * `BillingWebhookService` desde un webhook de Stripe YA verificado
   * (firma + frescura, ADR-0006); ver `activateFromCheckout`. Un despliegue
   * sin pasarela (adaptador nulo) necesitaría, para reintroducir un checkout
   * asistido, un principal interno de operaciones separado —autenticado,
   * distinto de cualquier rol de organización cliente— con auditoría
   * obligatoria (quién/cuándo/referencia del cobro externo). Ese principal no
   * existe todavía y diseñarlo toca el módulo de identidad, fuera del alcance
   * de este cambio: queda como decisión pendiente para Sergio.
   *
   * `requireDecider` se conserva para que un caller no autenticado o sin
   * membresía siga viendo su 401/403 de siempre; después de eso, CUALQUIER
   * owner/admin recibe el mismo 403 — no hay excepción posible porque no hay
   * segundo tipo de principal que distinguir. No se toca la base de datos.
   */
  @Post('upgrade-intents/:intentId/confirm')
  confirmUpgradeIntent(
    @Param('intentId', new ParseUUIDPipe({ version: '4' })) intentId: string,
    @Req() request: AuthenticatedRequest,
  ): never {
    requireDecider(request);
    throw new ForbiddenException({
      code: 'assisted_checkout_confirmation_retired',
      message:
        'La confirmación manual de upgrade-intents está retirada: ningún ' +
        'miembro de la organización cliente puede confirmar su propio ' +
        'upgrade. La activación real llega por el webhook firmado del ' +
        'proveedor de pagos.',
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
      return {
        organizationId: null,
        subscription: null,
        pendingPayment: null,
        entitlements: [],
      };
    }

    // Transición perezosa: la lectura comercial es el punto de sincronía del
    // trial vencido (los guards ya fallan cerrado por fecha sin escribir).
    await this.lifecycle.settleExpiredTrial(organizationId, tenantId);

    const [subscription, awaiting] = await Promise.all([
      this.subscriptions.findOneBy({ organizationId, tenantId }),
      this.upgradeIntents.findOneBy({ organizationId, status: 'pending' }),
    ]);
    const pendingPayment: PendingPaymentView | null =
      awaiting?.awaitingPaymentAt && awaiting.paymentMethod
        ? {
            method: awaiting.paymentMethod,
            since: awaiting.awaitingPaymentAt,
            voucherUrl: awaiting.voucherUrl,
            planCode: awaiting.requestedPlanCode,
          }
        : null;
    if (!subscription) {
      return {
        organizationId,
        subscription: null,
        pendingPayment,
        entitlements: [],
      };
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
        // Asientos PAGADOS: el mismo número que la API impone al invitar. Se
        // publica para que la interfaz pueda decir «3 de 3 usados» antes de
        // que alguien choque contra el 409, no después.
        seats: Math.max(1, Number(subscription.seats) || 1),
        effective,
      },
      pendingPayment,
      entitlements,
    };
  }
}
