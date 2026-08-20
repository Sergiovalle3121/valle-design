import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Body parser CRUDO, montado SÓLO bajo las rutas del receptor de outbox.
 *
 * Es el mismo principio que `stripe-webhook.raw-body.ts`, ahora aplicado al
 * webhook que NOSOTROS emitimos (ADR-0006): la firma HMAC cubre los bytes
 * exactos que el worker envió, y `express.json()` los destruye al parsear —
 * re-serializar el objeto produce otros bytes (orden de claves, escapes) y la
 * verificación fallaría con firmas legítimas, invitando a «arreglarlo»
 * aflojando la verificación. Aquí la firma se comprueba sobre lo que llegó,
 * byte a byte, o no se comprueba nada.
 *
 * Se monta en el prefijo `/v1/outbox` y no globalmente por la misma razón que
 * el de Stripe: el resto del producto acepta documentos JSON de hasta 16 MB y
 * bufferear todo dos veces duplicaría la memoria de cada subida CAD.
 */

export const OUTBOX_RECEIVER_PATH = '/v1/outbox';

/**
 * Tope del cuerpo. Un mensaje de outbox (correo de identidad, invitación,
 * evento de dominio) vive en pocos KB; 1 MB es holgura de sobra y sigue siendo
 * un tope real frente a un emisor que se haga pasar por el worker — la firma
 * se comprueba DESPUÉS de leer, así que el tope es la única defensa durante la
 * lectura.
 */
export const OUTBOX_RECEIVER_BODY_LIMIT_BYTES = 1_048_576;

type RawBodyRequest = IncomingMessage & { body?: unknown; _body?: boolean };

/**
 * Middleware de Express que deja `request.body` como Buffer con los bytes tal
 * cual llegaron. Marca `_body` para que el parser JSON global, que corre
 * después, no vuelva a tocar el stream.
 */
export function outboxReceiverRawBody() {
  return (
    request: RawBodyRequest,
    _response: ServerResponse,
    next: (error?: unknown) => void,
  ): void => {
    if (request._body) {
      next();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      request.removeListener('data', onData);
      request.removeListener('end', onEnd);
      request.removeListener('error', fail);
      next(error);
    };
    function onData(chunk: Buffer): void {
      if (settled) return;
      size += chunk.length;
      if (size > OUTBOX_RECEIVER_BODY_LIMIT_BYTES) {
        // Se corta EN CUANTO se pasa, sin acumular el resto: un cuerpo enorme
        // no debe poder ocupar memoria por el mero hecho de llegar.
        fail(new OutboxReceiverBodyTooLargeError());
        return;
      }
      chunks.push(chunk);
    }
    function onEnd(): void {
      if (settled) return;
      settled = true;
      request.body = Buffer.concat(chunks);
      request._body = true;
      next();
    }
    request.on('data', onData);
    request.on('end', onEnd);
    request.on('error', fail);
  };
}

export class OutboxReceiverBodyTooLargeError extends Error {
  readonly statusCode = 413;

  constructor() {
    super('El cuerpo del webhook supera el tamaño permitido.');
    this.name = 'OutboxReceiverBodyTooLargeError';
  }
}

/**
 * Registra el parser crudo en la aplicación. Debe llamarse ANTES del parser
 * JSON global; el orden de `use` es el orden de ejecución en Express.
 */
export function useOutboxReceiverRawBody(app: {
  use(...handlers: unknown[]): unknown;
}): void {
  app.use(OUTBOX_RECEIVER_PATH, outboxReceiverRawBody());
}
