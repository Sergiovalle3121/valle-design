import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { DataSource, Repository } from 'typeorm';
import { isUniqueViolation } from '../../../common/database/unique-violation';
import {
  Invoice,
  PLAN_PRICE_PERIODS,
  PlanCatalog,
  PlanPrice,
  type PlanPricePeriod,
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
import {
  type AuthenticatedRequest,
  requireDecider,
  requireOwner,
} from './commercial-request-context';

class CheckoutSessionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  planCode!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsIn([...PLAN_PRICE_PERIODS])
  period!: PlanPricePeriod;
}

/** Vista contractual de una factura espejo: nunca datos de pago. */
function invoiceView(invoice: Invoice) {
  return {
    id: invoice.id,
    number: invoice.number,
    // bigint llega como string desde PostgreSQL; el contrato publica enteros.
    amountCents: Number(invoice.amountCents),
    currency: invoice.currency,
    status: invoice.status,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    hostedUrl: invoice.hostedUrl,
    issuedAt: invoice.issuedAt,
  };
}

/**
 * COMPRA AUTOSERVICIO: checkout hospedado, historial de facturas y baja.
 *
 * Separado de CommercialController (estado + intents) porque son dos
 * responsabilidades con dependencias distintas: aquél lee el estado comercial,
 * éste habla con la pasarela. Comparten prefijo `/v1/commercial` y las mismas
 * reglas de acceso, que viven en commercial-request-context.
 *
 * Con el adaptador NULO todas estas rutas siguen respondiendo, y responden la
 * verdad: el cobro es externo/asistido. Ninguna finge.
 */
@Controller('v1/commercial')
export class BillingController {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(Invoice)
    private readonly invoices: Repository<Invoice>,
    private readonly data: DataSource,
    @Inject(CAD_EVENT_PUBLISHER)
    private readonly events: CadEventPublisher,
    @Inject(PAYMENT_PROVIDER)
    private readonly payments: PaymentProvider,
  ) {}

  /**
   * Abre una compra: intent auditable + sesión hospedada del proveedor.
   *
   * El intent se crea y se COMMITEA antes de llamar al proveedor (ADR-0006: no
   * se mantiene una transacción abierta durante una llamada de red). Si el
   * proveedor falla, el intent queda `pending` — no es basura: el siguiente
   * intento lo REUTILIZA para pedir una sesión nueva, y un owner/admin puede
   * cancelarlo por la ruta que ya existe. Así no hace falta una transacción
   * compensatoria que también podría fallar.
   */
  @Post('checkout-sessions')
  async createCheckoutSession(
    @Body() body: CheckoutSessionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { user, organizationId } = requireDecider(request);
    const descriptor = this.payments.descriptor();

    const { intent, price } = await this.openIntent(
      body,
      organizationId,
      user.userId,
    );

    const result = await this.payments.createCheckout(
      {
        intentId: intent.id,
        organizationId,
        planCode: intent.requestedPlanCode,
      },
      {
        planCode: price.planCode,
        currency: price.currency,
        period: price.period,
        amountCents: Number(price.amountCents),
      },
    );
    if (result.kind === 'unavailable') {
      // El 409 HONESTO que ya existía: no es un fallo del sistema, es que el
      // cobro de este despliegue va por fuera. El intent queda registrado, que
      // es exactamente lo que el camino asistido necesita.
      throw new ConflictException({
        code: 'checkout_unavailable',
        message: result.reason,
        intentId: intent.id,
      });
    }
    return {
      provider: descriptor.name,
      checkout: descriptor.mode,
      intentId: intent.id,
      reference: result.reference,
      url: result.kind === 'hosted' ? result.url : null,
    };
  }

  /** Historial de facturas de la organización (owner/admin). */
  @Get('invoices')
  async listInvoices(@Req() request: AuthenticatedRequest) {
    const { organizationId } = requireDecider(request);
    const items = await this.invoices.find({
      where: { organizationId, tenantId: organizationId },
      order: { issuedAt: 'DESC' },
      take: 200,
    });
    return { organizationId, items: items.map(invoiceView) };
  }

  /**
   * Baja AUTOSERVICIO a fin de período (owner).
   *
   * No corta el acceso: lo comprado sigue vigente hasta `currentPeriodEnd`, y
   * el estado `cancelled` lo pondrá el webhook del proveedor cuando el período
   * expire de verdad. Con el adaptador nulo no hay a quién pedírselo, así que
   * la solicitud queda como evento de dominio para que el operador actúe — una
   * baja que sólo existiera en la interfaz sería mentira.
   */
  // 200: la baja MODIFICA la suscripción existente, no crea un recurso nuevo.
  @HttpCode(HttpStatus.OK)
  @Post('subscription/cancel')
  async cancelSubscription(@Req() request: AuthenticatedRequest) {
    const { user, organizationId } = requireOwner(request);
    const subscription = await this.subscriptions.findOneBy({
      organizationId,
      tenantId: organizationId,
    });
    if (!subscription) {
      throw new NotFoundException('La organización no tiene suscripción.');
    }
    if (subscription.status === 'cancelled') {
      throw new ConflictException({
        code: 'subscription_already_cancelled',
        message: 'La suscripción ya está cancelada.',
      });
    }

    const result = subscription.providerSubscriptionId
      ? await this.payments.cancelAtPeriodEnd({
          providerSubscriptionId: subscription.providerSubscriptionId,
        })
      : ({
          kind: 'unavailable',
          reason:
            'La suscripción no está enlazada a una pasarela: la baja la aplica el operador.',
        } as const);

    return this.data.transaction(async (manager) => {
      const scheduled = result.kind === 'scheduled';
      if (scheduled) {
        await manager.update(
          Subscription,
          { organizationId, tenantId: organizationId },
          {
            cancelAtPeriodEnd: true,
            ...(result.currentPeriodEnd
              ? { currentPeriodEnd: result.currentPeriodEnd }
              : {}),
          },
        );
      }
      const current = await manager.findOneByOrFail(Subscription, {
        organizationId,
        tenantId: organizationId,
      });
      await this.events.publish(
        {
          organizationId,
          tenantId: organizationId,
          type: scheduled
            ? 'commercial.subscription.cancellation_scheduled'
            : 'commercial.subscription.cancellation_requested',
          aggregateId: current.id,
          payload: {
            planCode: current.planCode,
            requestedByUserId: user.userId,
            currentPeriodEnd: current.currentPeriodEnd
              ? new Date(current.currentPeriodEnd).toISOString()
              : null,
          },
          // Una sola solicitud por suscripción y estado: pulsar «cancelar» dos
          // veces no llena el outbox de eventos idénticos.
          idempotencyKey: `${
            scheduled ? 'cancellation-scheduled' : 'cancellation-requested'
          }:${current.id}`,
        },
        { native: manager },
      );
      return {
        organizationId,
        cancellation: {
          kind: scheduled ? ('scheduled' as const) : ('recorded' as const),
          message: scheduled
            ? 'La suscripción no se renovará al terminar el período en curso.'
            : result.reason,
        },
        subscription: {
          planCode: current.planCode,
          status: current.status,
          trialEndsAt: current.trialEndsAt,
          currentPeriodEnd: current.currentPeriodEnd,
          cancelAtPeriodEnd: current.cancelAtPeriodEnd,
        },
      };
    });
  }

  /**
   * Intent + precio vendible para la compra. Reutiliza el pending existente
   * cuando pide el MISMO plan (el usuario que abandonó la página del proveedor
   * y vuelve), y rechaza con el 409 de siempre cuando pide otro: dos compras
   * abiertas a la vez es exactamente lo que el índice único parcial prohíbe.
   */
  private async openIntent(
    body: CheckoutSessionDto,
    organizationId: string,
    userId: string,
  ): Promise<{ intent: SubscriptionUpgradeIntent; price: PlanPrice }> {
    try {
      return await this.data.transaction(async (manager) => {
        const plan = await manager.findOneBy(PlanCatalog, {
          code: body.planCode,
        });
        // Un trial no se compra (misma regla que POST upgrade-intents).
        if (
          !plan?.active ||
          (plan.metadata as { kind?: string } | null)?.kind === 'trial'
        ) {
          throw new BadRequestException({
            code: 'plan_unavailable',
            message: 'El plan solicitado no está disponible para compra.',
          });
        }
        const price = await manager.findOneBy(PlanPrice, {
          planCode: plan.code,
          currency: body.currency,
          period: body.period,
          active: true,
        });
        if (!price) {
          throw new BadRequestException({
            code: 'price_unavailable',
            message:
              'No hay un precio publicado para ese plan, moneda y período.',
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

        const pending = await manager.findOneBy(SubscriptionUpgradeIntent, {
          organizationId,
          status: 'pending',
        });
        if (pending) {
          if (pending.requestedPlanCode !== plan.code) {
            throw new ConflictException({
              code: 'upgrade_intent_pending',
              message: 'Ya existe un intent de upgrade pendiente de decisión.',
            });
          }
          return { intent: pending, price };
        }
        const intent = await manager.save(
          SubscriptionUpgradeIntent,
          manager.create(SubscriptionUpgradeIntent, {
            organizationId,
            tenantId: organizationId,
            requestedPlanCode: plan.code,
            status: 'pending',
            requestedByUserId: userId,
            decidedByUserId: null,
            decidedAt: null,
          }),
        );
        return { intent, price };
      });
    } catch (error) {
      // Bajo carrera el árbitro es el índice único parcial, no el SELECT de
      // arriba: dos peticiones simultáneas leen «no hay pending» y sólo una
      // inserta.
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'upgrade_intent_pending',
          message: 'Ya existe un intent de upgrade pendiente de decisión.',
        });
      }
      throw error;
    }
  }
}
