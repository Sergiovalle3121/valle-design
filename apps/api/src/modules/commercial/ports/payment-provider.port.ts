import type { PlanPricePeriod } from '../entities/commercial.entities';

/**
 * Puerto de pagos (P3 ola 1). Interfaz mínima y HONESTA: describe únicamente
 * lo que el producto necesita hoy para publicar su modo de cobro y lo que la
 * ola 2 (Stripe) tendrá que implementar de verdad — nada especulativo.
 *
 * Como el resto de puertos comerciales, no depende de HTTP, Nest ni de un
 * proveedor concreto.
 */

/**
 * Modo de cobro que el catálogo publica. En la ola 1 sólo existe `external`:
 * el cobro ocurre FUERA del producto (asistido) y se registra vía
 * upgrade-intents. Una pasarela real (ola 2) amplía esta unión — y con ella el
 * contrato OpenAPI, que hoy la declara como enum cerrado a propósito.
 */
export type PaymentCheckoutMode = 'external';

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
}

/** Foto del precio elegido, ya normalizada (céntimos como número entero). */
export interface PaymentPriceSnapshot {
  readonly planCode: string;
  readonly currency: string;
  readonly period: PlanPricePeriod;
  readonly amountCents: number;
}

export type PaymentCheckoutResult =
  /** El cobro sigue un camino externo; `reference` lo identifica de forma auditable. */
  | { kind: 'external'; reference: string }
  /** El proveedor no puede iniciar este cobro; `reason` explica el camino real. */
  | { kind: 'unavailable'; reason: string };

/** Evento de webhook YA verificado (firma y frescura) por el proveedor. */
export interface PaymentWebhookEvent {
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
