import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Body parser CRUDO, montado SÓLO en la ruta del webhook de Stripe.
 *
 * La firma cubre los bytes exactos que el proveedor envió. `express.json()`
 * los descarta al parsear y `JSON.stringify` del objeto resultante produce
 * otros bytes (orden de claves, escapes, espacios): re-serializar para
 * verificar la firma haría fallar webhooks legítimos y — peor — invitaría a
 * «arreglarlo» aflojando la verificación. Mismo principio que ADR-0006 exige a
 * nuestros receptores, aplicado a nosotros como receptores.
 *
 * Se monta en una ruta y no globalmente porque el resto del producto acepta
 * documentos JSON de hasta 16 MB y bufferear todo dos veces (crudo + parseado)
 * duplicaría la memoria de cada subida CAD sin que nadie lo pidiera.
 *
 * Escrito a mano, sin `express.raw`/`body-parser`: son ~40 líneas, evitan
 * declarar una dependencia nueva sólo para esto y dejan a la vista lo único
 * que aquí importa — que el límite se aplica MIENTRAS se lee, no después.
 */

export const STRIPE_WEBHOOK_PATH = '/v1/commercial/webhooks/stripe';

/**
 * Tope del cuerpo. Un evento de Stripe vive en pocos KB; 1 MB es holgura
 * suficiente para el objeto más expandido y sigue siendo un tope real frente a
 * un emisor que se haga pasar por el proveedor (la firma se comprueba DESPUÉS
 * de leer, así que el tope es la única defensa durante la lectura).
 */
export const STRIPE_WEBHOOK_BODY_LIMIT_BYTES = 1_048_576;

type RawBodyRequest = IncomingMessage & { body?: unknown; _body?: boolean };

/**
 * Middleware de Express que deja `request.body` como Buffer con los bytes tal
 * cual llegaron. Marca `_body` para que el parser JSON global, que corre
 * después, no vuelva a tocar el stream.
 */
export function stripeWebhookRawBody() {
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
      if (size > STRIPE_WEBHOOK_BODY_LIMIT_BYTES) {
        // Se corta EN CUANTO se pasa, sin acumular el resto: un cuerpo enorme
        // no debe poder ocupar memoria por el mero hecho de llegar.
        fail(new StripeWebhookBodyTooLargeError());
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

export class StripeWebhookBodyTooLargeError extends Error {
  readonly statusCode = 413;

  constructor() {
    super('El cuerpo del webhook supera el tamaño permitido.');
    this.name = 'StripeWebhookBodyTooLargeError';
  }
}

/**
 * Registra el parser crudo en la aplicación. Debe llamarse ANTES del parser
 * JSON global; el orden de `use` es el orden de ejecución en Express.
 */
export function useStripeWebhookRawBody(app: {
  use(...handlers: unknown[]): unknown;
}): void {
  app.use(STRIPE_WEBHOOK_PATH, stripeWebhookRawBody());
}
