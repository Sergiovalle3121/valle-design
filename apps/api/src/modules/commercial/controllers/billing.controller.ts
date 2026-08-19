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
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DataSource, Repository } from 'typeorm';
import { isUniqueViolation } from '../../../common/database/unique-violation';
import {
  Invoice,
  PAYMENT_METHODS,
  PLAN_PRICE_PERIODS,
  type PaymentMethod,
  PlanCatalog,
  PlanPrice,
  type PlanPricePeriod,
  Subscription,
  SubscriptionUpgradeIntent,
  TaxProfile,
} from '../entities/commercial.entities';
import {
  CAD_EVENT_PUBLISHER,
  type CadEventPublisher,
} from '../ports/commercial.ports';
import {
  PAYMENT_PROVIDER,
  type PaymentCheckoutResult,
  type PaymentProvider,
} from '../ports/payment-provider.port';
import { StripePaymentMethodError } from '../adapters/stripe-payment.provider';
import {
  type AuthenticatedRequest,
  requireDecider,
  requireOwner,
} from './commercial-request-context';

/** Tope del contrato. Un despacho de mil asientos ya no compra por checkout. */
const MAX_CHECKOUT_SEATS = 1_000;

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

  /**
   * Asientos contratados. Opcional: omitirlo significa «el mínimo del plan»,
   * que es lo que la página de precios anuncia como primera factura.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_CHECKOUT_SEATS)
  seats?: number;

  /**
   * Medio de pago. Omitirlo significa tarjeta, que es lo que el producto ya
   * hacía: un cliente existente que no manda el campo sigue comprando igual.
   */
  @IsOptional()
  @IsIn([...PAYMENT_METHODS])
  paymentMethod?: PaymentMethod;
}

/**
 * Asientos que se van a COBRAR, decididos por el catálogo y no por el cliente.
 *
 * El cliente elige la cantidad; el producto decide si esa cantidad es legítima
 * para ese plan. Un plan que no cobra por usuario sólo admite un asiento: su
 * precio publicado representa la cuenta entera, así que multiplicarlo por tres
 * cobraría el triple por lo mismo. Y por debajo del mínimo se rechaza en vez de
 * subirlo en silencio: quien pidió dos asientos de un plan de tres tiene que
 * enterarse antes de pagar, no después en la factura.
 */
export function resolveCheckoutSeats(
  plan: PlanCatalog,
  requested: number | undefined,
): number {
  const metadata = (plan.metadata ?? {}) as {
    perSeat?: unknown;
    seatsMinimum?: unknown;
  };
  const perSeat = metadata.perSeat === true;
  const rawMinimum = Number(metadata.seatsMinimum);
  const minimum =
    Number.isInteger(rawMinimum) &&
    rawMinimum >= 1 &&
    rawMinimum <= MAX_CHECKOUT_SEATS
      ? rawMinimum
      : 1;

  if (!perSeat) {
    if (requested !== undefined && requested !== 1) {
      throw new BadRequestException({
        code: 'seats_not_applicable',
        message: `El plan "${plan.code}" no cobra por usuario: su precio cubre la cuenta entera.`,
      });
    }
    return 1;
  }
  const seats = requested ?? minimum;
  if (seats < minimum) {
    throw new BadRequestException({
      code: 'seats_below_minimum',
      message: `El plan "${plan.code}" se contrata desde ${minimum} usuarios.`,
      minimumSeats: minimum,
    });
  }
  return seats;
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
    @InjectRepository(TaxProfile)
    private readonly taxProfiles: Repository<TaxProfile>,
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
    const paymentMethod: PaymentMethod = body.paymentMethod ?? 'card';

    // DATOS FISCALES ANTES DEL COBRO, y ésta es la línea que lo impone.
    //
    // Sin RFC no hay CFDI, sin CFDI no hay gasto deducible y sin gasto
    // deducible el despacho no contrata. Pedirlos DESPUÉS convierte cada cobro
    // en una persecución por correo con el mes ya cerrado. Se comprueba antes
    // de abrir el intent para no dejar una compra a medias detrás de un 409.
    const taxProfile = await this.taxProfiles.findOneBy({
      organizationId,
      tenantId: organizationId,
    });
    if (!taxProfile) {
      throw new ConflictException({
        code: 'tax_profile_required',
        message:
          'Antes de cobrar necesitamos tus datos fiscales (RFC, razón social, ' +
          'régimen fiscal, uso de CFDI y código postal). Sin ellos no podemos ' +
          'emitirte un CFDI y el pago no sería deducible.',
      });
    }

    const { intent, price, seats } = await this.openIntent(
      body,
      organizationId,
      user.userId,
      paymentMethod,
    );

    // Anotado: sin el tipo, `let` sin inicializar se infiere `any` y el
    // resultado del proveedor —el que decide si hay cobro— dejaría de estar
    // comprobado justo donde importa.
    let result: PaymentCheckoutResult;
    try {
      result = await this.payments.createCheckout(
        {
          intentId: intent.id,
          organizationId,
          planCode: intent.requestedPlanCode,
          seats,
          paymentMethod,
        },
        {
          planCode: price.planCode,
          currency: price.currency,
          period: price.period,
          amountCents: Number(price.amountCents),
        },
      );
    } catch (error) {
      // El medio elegido no sirve para ESTE pedido (moneda que OXXO no cobra,
      // importe por encima del tope de una ficha). Es un 400 con el motivo
      // exacto, no un 500: el cliente puede arreglarlo eligiendo otro medio, y
      // sólo puede hacerlo si se le dice cuál es el problema.
      if (error instanceof StripePaymentMethodError) {
        throw new BadRequestException({
          code: error.code,
          message: error.message,
          intentId: intent.id,
        });
      }
      throw error;
    }
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
      seats,
      paymentMethod,
      // `asynchronous` es lo que permite a la web decir «te esperamos» en vez
      // de «pago fallido» cuando el cliente vuelve de OXXO sin haber pagado
      // todavía. Sin este dato, la única lectura posible de una suscripción no
      // activa es el fracaso.
      asynchronous: result.kind === 'hosted' && result.asynchronous,
    };
  }

  /**
   * Abre el PORTAL DEL PROVEEDOR para que el cliente arregle su medio de pago.
   *
   * Hasta ahora, a una organización en `past_due` se le informaba de que el
   * cobro había fallado y ahí terminaba todo: su único camino era escribir a
   * soporte. Los datos de la tarjeta no pasan —ni deben pasar— por este
   * producto, así que la forma honesta de resolverlo es llevar al cliente al
   * portal del proveedor, que es quien la custodia.
   *
   * Owner/admin: quien puede comprar puede arreglar el pago de lo comprado.
   */
  // 200: no se crea un recurso del producto, se pide una URL efímera prestada.
  @HttpCode(HttpStatus.OK)
  @Post('billing-portal-sessions')
  async createBillingPortalSession(@Req() request: AuthenticatedRequest) {
    const { organizationId } = requireDecider(request);
    const subscription = await this.subscriptions.findOneBy({
      organizationId,
      tenantId: organizationId,
    });
    if (!subscription) {
      throw new NotFoundException('La organización no tiene suscripción.');
    }
    if (!subscription.providerCustomerId) {
      // Sin cliente en la pasarela no hay portal que abrir: o el cobro de esta
      // organización es externo, o todavía no ha pagado nunca. Un 409 con el
      // motivo es más útil que una URL vacía.
      throw new ConflictException({
        code: 'billing_portal_unavailable',
        message:
          'Esta organización no tiene un cliente en la pasarela: su cobro no ' +
          'pasa por ella, así que no hay medio de pago que actualizar aquí.',
      });
    }

    const result = await this.payments.createBillingPortalSession({
      providerCustomerId: subscription.providerCustomerId,
    });
    if (result.kind === 'unavailable') {
      throw new ConflictException({
        code: 'billing_portal_unavailable',
        message: result.reason,
      });
    }
    return { organizationId, url: result.url };
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
    paymentMethod: PaymentMethod,
  ): Promise<{
    intent: SubscriptionUpgradeIntent;
    price: PlanPrice;
    seats: number;
  }> {
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
        // Se resuelven ANTES de tocar nada más: rechazar una compra por
        // asientos inválidos no debe dejar un intent abierto detrás.
        const seats = resolveCheckoutSeats(plan, body.seats);
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
          // El intent reutilizado se ACTUALIZA con lo que se pide ahora: quien
          // abandonó la ficha de OXXO y vuelve con tarjeta, o cambia de tres a
          // cinco asientos, tiene que quedar registrado con lo que va a pagar
          // de verdad. Un intent que conservase la petición vieja activaría
          // después la suscripción con los asientos equivocados.
          await manager.update(
            SubscriptionUpgradeIntent,
            { id: pending.id },
            {
              requestedSeats: seats,
              paymentMethod,
              awaitingPaymentAt: null,
              voucherUrl: null,
            },
          );
          return {
            intent: await manager.findOneByOrFail(SubscriptionUpgradeIntent, {
              id: pending.id,
            }),
            price,
            seats,
          };
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
            requestedSeats: seats,
            paymentMethod,
            awaitingPaymentAt: null,
            voucherUrl: null,
          }),
        );
        return { intent, price, seats };
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
