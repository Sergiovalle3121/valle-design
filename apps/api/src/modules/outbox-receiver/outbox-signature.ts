import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verificación de la firma del outbox propio, espejo EXACTO de lo que emite
 * `webhook-outbox.transport.ts`: HMAC-SHA256 sobre `${timestamp}.${rawBody}`,
 * timestamp ISO-8601 en `X-Valle-Timestamp` y firma `sha256=<hex>` en
 * `X-Valle-Signature`. Cualquier divergencia entre emisor y receptor se paga
 * con correo varado, así que este archivo no inventa nada: calca el contrato.
 *
 * Vive separada del controller porque es lógica pura (bytes, reloj, secreto)
 * y las pruebas la ejercen sin HTTP; el mismo código corre en la spec de
 * circuito completo para que emisor y receptor se prueben el uno CONTRA el
 * otro, no cada uno contra su propia copia del contrato.
 */

export const OUTBOX_TIMESTAMP_HEADER = 'x-valle-timestamp';
export const OUTBOX_SIGNATURE_HEADER = 'x-valle-signature';

/**
 * Ventana de frescura ±300 s, la misma tolerancia por defecto que se acepta a
 * Stripe: fuera de ella una entrega es un replay y se rechaza ANTES de
 * comparar la firma. No es configurable a propósito — una ventana más ancha
 * sólo puede pedirla quien está reproduciendo tráfico viejo.
 */
export const OUTBOX_SIGNATURE_TOLERANCE_MS = 300_000;

/** El transporte firma con `.toISOString()`: esta es la única forma aceptada. */
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

const SIGNATURE_PREFIX = 'sha256=';

export class OutboxSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboxSignatureError';
  }
}

export interface OutboxSignatureInput {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
  secret: string;
  /** Inyectable para que las pruebas de frescura no dependan del reloj real. */
  now?: Date;
}

/**
 * Lanza `OutboxSignatureError` si la entrega no es verificable. El controller
 * traduce CUALQUIER causa al mismo 400 genérico: distinguir «firma inválida»
 * de «timestamp viejo» en la respuesta ayudaría a quien esté probando firmas.
 */
export function verifyOutboxSignature(input: OutboxSignatureInput): void {
  const { headers, rawBody, secret } = input;
  const now = input.now ?? new Date();

  if (secret.length === 0) {
    // Fallo CERRADO: un HMAC con clave vacía verificaría cualquier cuerpo que
    // un atacante firme con clave vacía. Mismo principio que el adaptador de
    // Stripe aplica a su webhook.
    throw new OutboxSignatureError(
      'No hay secreto de webhook configurado: la entrega no se puede verificar.',
    );
  }

  const timestamp = singleHeader(headers, OUTBOX_TIMESTAMP_HEADER);
  if (!timestamp || !ISO_TIMESTAMP_PATTERN.test(timestamp)) {
    throw new OutboxSignatureError(
      'Falta la cabecera X-Valle-Timestamp o no es un instante ISO-8601.',
    );
  }
  const issuedAtMs = Date.parse(timestamp);
  if (Number.isNaN(issuedAtMs)) {
    throw new OutboxSignatureError('X-Valle-Timestamp no es una fecha válida.');
  }
  if (Math.abs(now.getTime() - issuedAtMs) > OUTBOX_SIGNATURE_TOLERANCE_MS) {
    // Una entrega vieja (o fechada en el futuro) es un replay: se rechaza
    // ANTES de comparar la firma.
    throw new OutboxSignatureError(
      'El timestamp de la firma está fuera de la tolerancia permitida.',
    );
  }

  const header = singleHeader(headers, OUTBOX_SIGNATURE_HEADER);
  if (!header || !header.startsWith(SIGNATURE_PREFIX)) {
    throw new OutboxSignatureError(
      'Falta la cabecera X-Valle-Signature o no lleva el prefijo sha256=.',
    );
  }
  const candidate = header.slice(SIGNATURE_PREFIX.length);
  if (!/^[0-9a-f]+$/.test(candidate)) {
    throw new OutboxSignatureError(
      'La firma del webhook no es hexadecimal en minúsculas.',
    );
  }

  // Mismos bytes que firmó el emisor: el prefijo `${timestamp}.` como texto y
  // el cuerpo tal cual llegó, sin re-serializar.
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest();
  if (!constantTimeEqualHex(expected, candidate)) {
    throw new OutboxSignatureError('La firma del webhook no coincide.');
  }
}

/** Compara un digest binario con una firma hexadecimal, sin cortar antes. */
function constantTimeEqualHex(expected: Buffer, candidateHex: string): boolean {
  if (candidateHex.length !== expected.length * 2) return false;
  const candidate = Buffer.from(candidateHex, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(expected, candidate);
}

/**
 * Una cabecera repetida invalida la entrega en vez de dejar que gane una de
 * las dos copias: la ambigüedad no se resuelve, se rechaza.
 */
function singleHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  let found: string | null = null;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== name) continue;
    if (Array.isArray(value)) {
      if (value.length !== 1 || found !== null) return null;
      found = value[0];
      continue;
    }
    if (typeof value !== 'string' || found !== null) return null;
    found = value;
  }
  return found;
}
