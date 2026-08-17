import type { PlanPricePeriod } from '../entities/commercial.entities';

/**
 * Puerto de pagos. Interfaz mínima y HONESTA: describe únicamente lo que el
 * producto necesita para publicar su modo de cobro, iniciar una compra y
 * reaccionar a lo que el proveedor le cuenta — nada especulativo.
 *
 * La ola 1 dejó el enchufe con un solo adaptador (el nulo). La ola 2 añade el
 * adaptador de Stripe y con él lo que una pasarela REAL obliga a nombrar:
 * checkout hospedado y cancelación a fin de período. Como el resto de puertos
 * comerciales, no depende de HTTP, Nest ni de un proveedor concreto.
 */

/**
 * Modo de cobro que el catálogo publica.
 *
 * - `external`: el cobro ocurre FUERA del producto (asistido) y se registra vía
 *   upgrade-intents. Es lo único que el adaptador nulo puede ofrecer.
 * - `hosted`: el proveedor aloja la página de pago; el producto entrega una URL
 *   y el resultado vuelve por webhook firmado.
 */
export type PaymentCheckoutMode = 'external' | 'hosted';

export interface PaymentProviderDescriptor {
  /** Nombre estable del adaptador (p.ej. 'null', 'stripe'). */
  readonly name: string;
  readonly mode: PaymentCheckoutMode;
  /** false ⇒ el producto NO puede iniciar un cobro por sí mismo. */
  readonly available: boolean;
}

/** Lo que un checkout necesita saber del intent (nunca correos ni sesión). */
export interface PaymentCheckoutIntent {
  readonly intentId: string;
  readonly organizationId: string;
  readonly planCode: string;
  /**
   * Asientos contratados. Va en el INTENT y no en el precio porque el precio
   * es la tarifa publicada del catálogo —una por asiento— y los asientos son
   * la decisión de compra: mezclarlos haría que un plan por usuario pareciera
   * tener un precio distinto por cada organización.
   *
   * Siempre ≥ 1 y ya validado contra el mínimo del plan cuando llega aquí: un
   * adaptador nunca decide cuántos asientos son legítimos.
   */
  readonly seats: number;
}

/** Foto del precio elegido, ya normalizada (céntimos como número entero). */
export interface PaymentPriceSnapshot {
  readonly planCode: string;
  readonly currency: string;
  readonly period: PlanPricePeriod;
  readonly amountCents: number;
}

export type PaymentCheckoutResult =
  /** El proveedor aloja el pago; `url` es la página a la que ir. */
  | { kind: 'hosted'; url: string; reference: string }
  /** El cobro sigue un camino externo; `reference` lo identifica de forma auditable. */
  | { kind: 'external'; reference: string }
  /** El proveedor no puede iniciar este cobro; `reason` explica el camino real. */
  | { kind: 'unavailable'; reason: string };

/** Suscripción tal y como la conoce el proveedor (jamás nuestro UUID). */
export interface PaymentSubscriptionReference {
  readonly providerSubscriptionId: string;
}

export type PaymentCancellationResult =
  /** El proveedor dejará de renovar al terminar el período en curso. */
  | { kind: 'scheduled'; currentPeriodEnd: Date | null }
  /** El proveedor no puede programar la baja; `reason` explica el camino real. */
  | { kind: 'unavailable'; reason: string };

/** Evento de webhook YA verificado (firma y frescura) por el proveedor. */
export interface PaymentWebhookEvent {
  /** Identificador del evento en el proveedor: la clave de idempotencia. */
  readonly id: string;
  readonly type: string;
  readonly payload: unknown;
}

export interface PaymentProvider {
  descriptor(): PaymentProviderDescriptor;
  createCheckout(
    intent: PaymentCheckoutIntent,
    price: PaymentPriceSnapshot,
  ): Promise<PaymentCheckoutResult>;
  /**
   * Programa la baja a fin de período en el proveedor. No borra nada: la
   * suscripción sigue vigente hasta que termine el período ya pagado.
   */
  cancelAtPeriodEnd(
    reference: PaymentSubscriptionReference,
  ): Promise<PaymentCancellationResult>;
  /**
   * Verifica un webhook del proveedor sobre los BYTES crudos (nunca JSON
   * reserializado — mismo principio que ADR-0006). El adaptador nulo no lo
   * implementa: sin pasarela no existe emisor legítimo y aceptar un webhook
   * sería fabricar un cobro.
   */
  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
  ): Promise<PaymentWebhookEvent>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
