import { Injectable } from '@nestjs/common';
import type {
  PaymentCancellationResult,
  PaymentCheckoutResult,
  PaymentPortalResult,
  PaymentProvider,
  PaymentProviderDescriptor,
  PaymentWebhookEvent,
} from '../ports/payment-provider.port';

/**
 * Adaptador de pagos POR DEFECTO del piloto: no hay pasarela.
 *
 * Deja constancia explícita de cómo se cobra hoy: el cobro es EXTERNO y
 * asistido — un owner/admin lo confirma tras recibirlo, vía
 * `subscription_upgrade_intents` (#83), que sigue siendo el único camino.
 * Por eso `mode: 'external'` (así lo publica GET /v1/commercial/plans) y
 * `available: false` (el producto no puede iniciar un cobro por sí mismo).
 *
 * Sigue siendo el adaptador que el módulo inyecta cuando no hay configuración
 * de Stripe: la selección es por configuración y JAMÁS a medias
 * (resolveStripeConfiguration en stripe-payment.provider.ts).
 */
@Injectable()
export class NullPaymentProvider implements PaymentProvider {
  descriptor(): PaymentProviderDescriptor {
    return { name: 'null', mode: 'external', available: false };
  }

  createCheckout(): Promise<PaymentCheckoutResult> {
    // Honesto, no un stub: este adaptador JAMÁS podrá crear un checkout. La
    // respuesta estructurada permite al llamador contarle al usuario el camino
    // real sin tratar la ausencia de pasarela como un error del sistema.
    return Promise.resolve({
      kind: 'unavailable',
      reason:
        'Sin pasarela de pagos: el cobro del piloto es externo/asistido y se ' +
        'registra vía upgrade-intents (POST /v1/commercial/upgrade-intents).',
    });
  }

  cancelAtPeriodEnd(): Promise<PaymentCancellationResult> {
    // Tampoco puede dar de baja lo que nunca cobró. Quien llama deja la
    // constancia durable para el operador (evento de dominio por el outbox);
    // aquí sólo se dice la verdad: no hay proveedor que programe la baja.
    return Promise.resolve({
      kind: 'unavailable',
      reason:
        'Sin pasarela de pagos: la baja la aplica el operador sobre el cobro ' +
        'externo; la solicitud queda registrada para que actúe.',
    });
  }

  createBillingPortalSession(): Promise<PaymentPortalResult> {
    // Sin pasarela no hay medio de pago que arreglar: el cobro externo lo
    // gestiona una persona. Se dice, en vez de abrir una página vacía.
    return Promise.resolve({
      kind: 'unavailable',
      reason:
        'Sin pasarela de pagos no hay portal del proveedor: el cobro del ' +
        'piloto es externo/asistido y lo gestiona el equipo comercial.',
    });
  }

  verifyWebhook(): Promise<PaymentWebhookEvent> {
    // Nunca implementado por el nulo: sin pasarela no existe emisor legítimo;
    // aceptar (o simular) un webhook sería fabricar un cobro.
    return Promise.reject(
      new Error(
        'NullPaymentProvider no verifica webhooks: no hay pasarela de pagos configurada.',
      ),
    );
  }
}
