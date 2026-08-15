import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { isUniqueViolation } from '../../common/database/unique-violation';
import {
  Invoice,
  type InvoiceStatus,
  PaymentEvent,
  Subscription,
  SubscriptionUpgradeIntent,
  type SubscriptionStatus,
} from './entities/commercial.entities';
import {
  CAD_EVENT_PUBLISHER,
  type CadEventPublisher,
} from './ports/commercial.ports';
import type { PaymentWebhookEvent } from './ports/payment-provider.port';
import {
  eventObject,
  invoicePeriod,
  invoiceSubscriptionId,
  readAmountCents,
  readCurrency,
  readEpochSeconds,
  readHttpsUrl,
  readMetadata,
  readProviderId,
  readReferenceId,
  readShortString,
} from './stripe-event.reader';

/**
 * Ciclo de vida de la suscripción movido por los webhooks de la pasarela.
 *
 * Tres invariantes gobiernan este servicio, y los tres son la razón de que sea
 * un servicio y no código en el controller:
 *
 * 1. UNA transacción por evento. El asiento de idempotencia
 *    (`payment_events`) y TODO el efecto (intent, suscripción, factura, evento
 *    de dominio en el outbox) comparten transacción. No existe el estado
 *    «cobré pero no lo apunté» ni el inverso.
 *
 * 2. La idempotencia la arbitra el ESQUEMA. El único sobre `event_id` es el
 *    árbitro real: dos entregas simultáneas del mismo evento aplican el efecto
 *    en paralelo, PostgreSQL serializa el INSERT y la perdedora hace rollback
 *    completo. No hay check-then-insert que una carrera pueda colar.
 *
 * 3. Un evento que aún no se puede correlacionar NO se marca como procesado.
 *    Se pide reintento (el proveedor reentrega con backoff) porque la
 *    correlación puede estar literalmente en vuelo: `invoice.paid` y
 *    `checkout.session.completed` viajan casi a la vez. Marcarlo procesado
 *    sería perder un cobro en silencio.
 *
 * Un tipo DESCONOCIDO sí se apunta y se acepta: el proveedor no debe reintentar
 * eternamente algo que este producto no modela, y la fila deja constancia de
 * que llegó.
 */

export type BillingWebhookStatus =
  /** Se aplicó el efecto y quedó apuntado. */
  | 'processed'
  /** Ya estaba apuntado: esta entrega no hizo nada. */
  | 'duplicate'
  /** Apuntado sin efecto (tipo que el producto no modela). */
  | 'ignored';

export interface BillingWebhookResult {
  status: BillingWebhookStatus;
  /** Qué ocurrió exactamente; se persiste en `payment_events.outcome`. */
  outcome: string;
}

/**
 * El evento es legítimo pero todavía no se puede atribuir a una organización.
 * Nada se persiste; el llamador responde un 409 para que el proveedor lo
 * reentregue cuando la correlación exista.
 */
export class BillingWebhookNotCorrelatedError extends Error {
  constructor(readonly outcome: string) {
    super(
      'El evento del proveedor todavía no se puede correlacionar con una organización.',
    );
    this.name = 'BillingWebhookNotCorrelatedError';
  }
}

const PROVIDER = 'stripe';
/** Estados desde los que un cobro correcto devuelve la suscripción a `active`. */
const REACTIVABLE: readonly SubscriptionStatus[] = [
  'active',
  'past_due',
  'trialing',
  'suspended',
];

@Injectable()
export class BillingWebhookService {
  constructor(
    private readonly database: DataSource,
    @Inject(CAD_EVENT_PUBLISHER)
    private readonly events: CadEventPublisher,
  ) {}

  /**
   * Procesa un evento YA verificado (firma y frescura las comprobó el
   * adaptador). `rawBody` sólo se usa para la huella auditable: el payload
   * puede contener datos de pago y nunca se persiste.
   */
  async process(
    event: PaymentWebhookEvent,
    rawBody: Buffer,
  ): Promise<BillingWebhookResult> {
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    try {
      return await this.database.transaction(async (manager) => {
        const result = await this.applyEffect(manager, event);
        // El asiento se escribe AL FINAL y en la misma transacción: si el
        // efecto falla no queda apuntado, y si dos entregas corren a la vez el
        // único decide cuál commitea.
        await manager.insert(PaymentEvent, {
          provider: PROVIDER,
          eventId: event.id,
          type: event.type.slice(0, 160),
          payloadHash,
          outcome: result.outcome,
        });
        return result;
      });
    } catch (error) {
      // El único de `event_id` es la barrera: la entrega repetida deshace su
      // propio efecto y se reporta como duplicada, nunca como error.
      if (isUniqueViolation(error)) {
        return { status: 'duplicate', outcome: 'duplicate' };
      }
      throw error;
    }
  }

  private async applyEffect(
    manager: EntityManager,
    event: PaymentWebhookEvent,
  ): Promise<BillingWebhookResult> {
    const object = eventObject(event.payload);
    switch (event.type) {
      case 'checkout.session.completed':
        return this.activateFromCheckout(manager, event, object);
      case 'invoice.paid':
        return this.recordPaidInvoice(manager, event, object);
      case 'invoice.payment_failed':
        return this.recordFailedInvoice(manager, event, object);
      case 'customer.subscription.deleted':
        return this.cancelSubscription(manager, event, object);
      default:
        // Nunca un 500 ni un reintento infinito: se apunta y se acepta.
        return { status: 'ignored', outcome: 'unhandled_type' };
    }
  }

  /**
   * `checkout.session.completed`: el cobro entró. Confirma el intent que abrió
   * la compra y deja la suscripción activa en el plan pedido.
   *
   * `decided_by_user_id` queda NULL a propósito: nadie de la organización
   * decidió este upgrade — lo decidió el pago. Inventar un usuario decisor
   * falsearía la auditoría del intent.
   */
  private async activateFromCheckout(
    manager: EntityManager,
    event: PaymentWebhookEvent,
    session: unknown,
  ): Promise<BillingWebhookResult> {
    const intentId =
      readReferenceId(session, 'client_reference_id') ??
      readMetadata(session, 'intentId');
    if (!intentId || !isUuid(intentId)) {
      // Una sesión sin nuestro intent no es nuestra compra; se apunta y se
      // acepta en vez de reintentarse para siempre.
      return { status: 'ignored', outcome: 'checkout_without_intent' };
    }
    const intent = await manager.findOneBy(SubscriptionUpgradeIntent, {
      id: intentId,
    });
    if (!intent) {
      throw new BillingWebhookNotCorrelatedError('checkout_intent_unknown');
    }

    const organizationId = intent.organizationId;
    // Sólo la transición pending→confirmed afecta filas; una redelivery que
    // llegara por otro camino encuentra 0 y sigue: la activación es una
    // afirmación de estado, no un incremento.
    await manager.update(
      SubscriptionUpgradeIntent,
      { id: intent.id, organizationId, status: 'pending' as const },
      {
        status: 'confirmed' as const,
        decidedByUserId: null,
        decidedAt: new Date(),
      },
    );

    const providerSubscriptionId = readReferenceId(session, 'subscription');
    const providerCustomerId = readReferenceId(session, 'customer');
    const currentPeriodEnd =
      readEpochSeconds(session, 'current_period_end') ??
      readEpochSeconds(readSubscriptionObject(session), 'current_period_end');

    const patch = {
      planCode: intent.requestedPlanCode,
      status: 'active' as const,
      trialEndsAt: null,
      cancelAtPeriodEnd: false,
      ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
      ...(providerSubscriptionId ? { providerSubscriptionId } : {}),
      ...(providerCustomerId ? { providerCustomerId } : {}),
    };
    const applied = await manager.update(
      Subscription,
      { organizationId, tenantId: organizationId },
      patch,
    );
    if (!applied.affected) {
      // Organización sin fila de suscripción (mismo caso que confirmar un
      // intent a mano): el cobro la crea, el resultado observable es el mismo.
      await manager.insert(Subscription, {
        organizationId,
        tenantId: organizationId,
        currentPeriodEnd: null,
        providerSubscriptionId: null,
        providerCustomerId: null,
        ...patch,
      });
    }
    const subscription = await manager.findOneByOrFail(Subscription, {
      organizationId,
      tenantId: organizationId,
    });
    await this.publish(manager, event, subscription, {
      type: 'commercial.subscription.activated',
      payload: {
        planCode: subscription.planCode,
        intentId: intent.id,
        currentPeriodEnd: isoOrNull(subscription.currentPeriodEnd),
      },
    });
    return { status: 'processed', outcome: 'subscription_activated' };
  }

  /** `invoice.paid`: renueva el período y guarda el espejo de la factura. */
  private async recordPaidInvoice(
    manager: EntityManager,
    event: PaymentWebhookEvent,
    invoice: unknown,
  ): Promise<BillingWebhookResult> {
    const subscription = await this.resolveSubscription(
      manager,
      invoice,
      'invoice_unmatched',
    );
    const period = invoicePeriod(invoice);
    await this.mirrorInvoice(manager, subscription.organizationId, invoice, {
      status: 'paid',
      amountKeys: ['amount_paid', 'total', 'amount_due'],
      period,
    });

    // Un cobro correcto NO resucita una suscripción cancelada: la baja fue una
    // decisión explícita y sólo el ciclo de alta puede deshacerla.
    const status: SubscriptionStatus = REACTIVABLE.includes(subscription.status)
      ? 'active'
      : subscription.status;
    // El período sólo avanza: un evento reentregado fuera de orden no puede
    // acortar lo que el cliente ya pagó.
    const currentPeriodEnd = laterOf(subscription.currentPeriodEnd, period.end);
    await manager.update(
      Subscription,
      {
        organizationId: subscription.organizationId,
        tenantId: subscription.organizationId,
      },
      { status, currentPeriodEnd },
    );
    await this.publish(manager, event, subscription, {
      type: 'commercial.subscription.renewed',
      payload: {
        planCode: subscription.planCode,
        currentPeriodEnd: isoOrNull(currentPeriodEnd),
      },
    });
    return { status: 'processed', outcome: 'subscription_renewed' };
  }

  /** `invoice.payment_failed`: el acceso pasa a `past_due`, no se corta. */
  private async recordFailedInvoice(
    manager: EntityManager,
    event: PaymentWebhookEvent,
    invoice: unknown,
  ): Promise<BillingWebhookResult> {
    const subscription = await this.resolveSubscription(
      manager,
      invoice,
      'invoice_unmatched',
    );
    await this.mirrorInvoice(manager, subscription.organizationId, invoice, {
      status: 'open',
      amountKeys: ['amount_due', 'total', 'amount_paid'],
      period: invoicePeriod(invoice),
    });
    if (subscription.status !== 'cancelled') {
      await manager.update(
        Subscription,
        {
          organizationId: subscription.organizationId,
          tenantId: subscription.organizationId,
        },
        { status: 'past_due' as const },
      );
    }
    await this.publish(manager, event, subscription, {
      type: 'commercial.subscription.payment_failed',
      payload: { planCode: subscription.planCode },
    });
    return { status: 'processed', outcome: 'subscription_past_due' };
  }

  /** `customer.subscription.deleted`: el proveedor ya no renovará. */
  private async cancelSubscription(
    manager: EntityManager,
    event: PaymentWebhookEvent,
    object: unknown,
  ): Promise<BillingWebhookResult> {
    const providerSubscriptionId = readProviderId(object, 'id');
    const providerCustomerId = readReferenceId(object, 'customer');
    const subscription = await this.lookup(
      manager,
      providerSubscriptionId,
      providerCustomerId,
      'subscription_unmatched',
    );
    await manager.update(
      Subscription,
      {
        organizationId: subscription.organizationId,
        tenantId: subscription.organizationId,
      },
      // `cancel_at_period_end` vuelve a false: ya no hay período que esperar,
      // la baja está consumada y dejarlo en true describiría un futuro que no
      // va a ocurrir.
      { status: 'cancelled' as const, cancelAtPeriodEnd: false },
    );
    await this.publish(manager, event, subscription, {
      type: 'commercial.subscription.cancelled',
      payload: {
        planCode: subscription.planCode,
        currentPeriodEnd: isoOrNull(subscription.currentPeriodEnd),
      },
    });
    return { status: 'processed', outcome: 'subscription_cancelled' };
  }

  private resolveSubscription(
    manager: EntityManager,
    invoice: unknown,
    outcome: string,
  ): Promise<Subscription> {
    return this.lookup(
      manager,
      invoiceSubscriptionId(invoice),
      readReferenceId(invoice, 'customer'),
      outcome,
    );
  }

  /**
   * Encuentra la organización dueña del evento. El identificador de suscripción
   * manda; el de cliente es el respaldo para el primer evento de una
   * suscripción que todavía no habíamos visto.
   */
  private async lookup(
    manager: EntityManager,
    providerSubscriptionId: string | null,
    providerCustomerId: string | null,
    outcome: string,
  ): Promise<Subscription> {
    const bySubscription = providerSubscriptionId
      ? await manager.findOneBy(Subscription, { providerSubscriptionId })
      : null;
    if (bySubscription) return bySubscription;
    const byCustomer = providerCustomerId
      ? await manager.findOneBy(Subscription, { providerCustomerId })
      : null;
    if (byCustomer) return byCustomer;
    throw new BillingWebhookNotCorrelatedError(outcome);
  }

  /**
   * Copia local de la factura. Es un ESPEJO: si ya existe se actualiza en
   * sitio (el proveedor puede reenviar la misma factura con otro estado) y el
   * único (provider, provider_invoice_id) impide duplicarla.
   */
  private async mirrorInvoice(
    manager: EntityManager,
    organizationId: string,
    invoice: unknown,
    options: {
      status: InvoiceStatus;
      amountKeys: string[];
      period: { start: Date | null; end: Date | null };
    },
  ): Promise<void> {
    const providerInvoiceId = readProviderId(invoice, 'id');
    const amountCents = readAmountCents(invoice, options.amountKeys);
    const currency = readCurrency(invoice, 'currency');
    // Sin identificador, importe o moneda no hay factura que reflejar. El
    // ciclo de vida de la suscripción NO depende de esto: el período se
    // renueva igual y el espejo simplemente no gana una fila incompleta.
    if (!providerInvoiceId || amountCents === null || !currency) return;

    const values = {
      organizationId,
      tenantId: organizationId,
      provider: PROVIDER,
      providerInvoiceId,
      number: readShortString(invoice, 'number', 80),
      amountCents,
      currency,
      status: options.status,
      periodStart: options.period.start,
      periodEnd: options.period.end,
      hostedUrl: readHttpsUrl(invoice, 'hosted_invoice_url'),
    };
    const existing = await manager.findOneBy(Invoice, {
      provider: PROVIDER,
      providerInvoiceId,
    });
    if (existing) {
      await manager.update(Invoice, { id: existing.id }, values);
      return;
    }
    await manager.insert(Invoice, values);
  }

  /**
   * Publica el evento de dominio por el outbox EXISTENTE, en la transacción
   * del efecto (ADR-0006). La clave de idempotencia es el id del evento del
   * proveedor: aunque el outbox entregue at-least-once, el consumidor puede
   * deduplicar por el mismo identificador que Stripe usó.
   */
  private publish(
    manager: EntityManager,
    event: PaymentWebhookEvent,
    subscription: Subscription,
    domain: { type: string; payload: Record<string, unknown> },
  ): Promise<void> {
    return this.events.publish(
      {
        organizationId: subscription.organizationId,
        tenantId: subscription.organizationId,
        type: domain.type,
        aggregateId: subscription.id,
        payload: domain.payload,
        idempotencyKey: `payment-event:${event.id}`,
      },
      { native: manager },
    );
  }
}

/** Suscripción expandida dentro de la sesión de checkout, si viene. */
function readSubscriptionObject(session: unknown): unknown {
  if (!session || typeof session !== 'object') return undefined;
  const candidate = (session as Record<string, unknown>).subscription;
  return candidate && typeof candidate === 'object' ? candidate : undefined;
}

function laterOf(current: Date | null, incoming: Date | null): Date | null {
  if (!incoming) return current;
  if (!current) return incoming;
  return new Date(incoming) > new Date(current) ? incoming : current;
}

function isoOrNull(value: Date | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
