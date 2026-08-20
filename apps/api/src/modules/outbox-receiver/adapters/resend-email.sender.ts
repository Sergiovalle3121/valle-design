import type { EmailSenderConfiguration } from '../email-sender.config';
import {
  EmailSendError,
  type EmailSender,
  type EmailSenderDescriptor,
  type EmailSendRequest,
} from '../ports/email-sender.port';

/**
 * Adaptador de Resend vía `fetch`, SIN SDK — la misma decisión que con
 * Stripe: la superficie usada es UN endpoint (`POST /emails`) y declarar una
 * dependencia con su árbol entero para eso multiplica la superficie de supply
 * chain sin comprar nada. Lo que el SDK haría por nosotros está a la vista:
 * Bearer, JSON y la cabecera Idempotency-Key que Resend soporta de forma
 * nativa — la mitad proveedor de la deduplicación que el recibo durable no
 * puede cubrir solo (ver email-sender.port.ts).
 */

const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Acotado y no configurable: el receptor responde a un webhook cuyo emisor ya
 * espera como mucho OUTBOX_WEBHOOK_TIMEOUT_MS (15 s por defecto); esperar al
 * proveedor más que eso sólo produciría respuestas que nadie escucha.
 */
const TIMEOUT_MS = 10_000;

export class ResendEmailSender implements EmailSender {
  constructor(private readonly configuration: EmailSenderConfiguration) {}

  descriptor(): EmailSenderDescriptor {
    return { name: 'resend', available: true };
  }

  async send(request: EmailSendRequest): Promise<void> {
    let response: Response;
    try {
      response = await fetch(RESEND_EMAILS_ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.configuration.apiKey}`,
          'content-type': 'application/json',
          // Estable entre reintentos: si el proceso cayó entre el envío y el
          // commit del recibo, la reentrega repite esta misma clave y Resend
          // no duplica el correo.
          'idempotency-key': request.idempotencyKey,
        },
        body: JSON.stringify({
          from: this.configuration.from,
          to: [request.to],
          subject: request.subject,
          html: request.html,
          text: request.text,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'error',
      });
    } catch {
      // Red caída, DNS, timeout: causa retryable, sin detalles del proveedor
      // (podrían llevar la URL con datos) ni del destinatario.
      throw new EmailSendError(null);
    }
    // Nunca se lee ni persiste el cuerpo del proveedor: puede llevar el
    // destinatario u otros datos que no deben acabar en logs propios.
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) {
      throw new EmailSendError(response.status);
    }
  }
}
