import {
  type EmailSender,
  type EmailSenderDescriptor,
  type EmailSendRequest,
} from '../ports/email-sender.port';

/**
 * Adaptador NULO: el despliegue no trae proveedor de correo y lo dice.
 *
 * El receptor consulta `available` y responde 503 ANTES de verificar nada, así
 * que el worker conserva cada correo en su outbox con reintentos y backoff en
 * vez de perderlo — la fila espera a que haya proveedor. `send` lanza por si
 * algún camino futuro se salta esa consulta: aceptar el envío en silencio
 * sería marcar como entregado un correo de verificación que nadie recibió,
 * el modo de fallo exacto que este módulo existe para impedir.
 */
export class NullEmailSender implements EmailSender {
  descriptor(): EmailSenderDescriptor {
    return { name: 'null', available: false };
  }

  send(_request: EmailSendRequest): Promise<void> {
    return Promise.reject(
      new Error(
        'No hay proveedor de correo configurado: el envío no se puede aceptar. ' +
          'Define EMAIL_SENDER_PROVIDER, EMAIL_SENDER_API_KEY, EMAIL_SENDER_FROM ' +
          'y OUTBOX_EMAIL_LINK_BASE_URL.',
      ),
    );
  }
}
