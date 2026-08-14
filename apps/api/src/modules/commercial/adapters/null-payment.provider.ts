import { Injectable } from '@nestjs/common';
import type {
  PaymentCheckoutResult,
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
 * La ola 2 sustituye este binding por el adaptador de Stripe en
 * commercial.module; nada más debería cambiar de sitio.
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
