/**
 * Parseo del cuerpo YA verificado de una entrega del outbox propio.
 *
 * Vive fuera del controller por la misma razón que la firma: es lógica pura
 * sobre bytes y la spec de circuito completo la ejecuta tal cual — el mismo
 * código que corre en producción, no una copia de prueba.
 *
 * Regla de seguridad central: la cola AUTORITATIVA es la del cuerpo FIRMADO,
 * nunca la URL que alguien invocó. Un cuerpo firmado para la cola `domain`
 * reproducido contra `/v1/outbox/email` llevaría una firma válida; si la URL
 * decidiera, ese replay podría intentar convertir un evento de dominio en un
 * envío de correo. Por eso el parseo exige que `queue` del cuerpo coincida
 * con el endpoint que lo recibió.
 *
 * Del mismo modo, la clave de deduplicación se toma del CUERPO
 * (`idempotencyKey`), no de la cabecera `Idempotency-Key`: la cabecera no
 * está cubierta por la firma y quien pueda tocarla podría des-deduplicar una
 * entrega legítima reproduciéndola con otra clave.
 */

export class OutboxDeliveryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboxDeliveryParseError';
  }
}

export interface EmailOutboxDelivery {
  queue: 'email';
  idempotencyKey: string;
  recipient: string;
  template: string;
  payload: unknown;
}

export interface DomainOutboxDelivery {
  queue: 'domain';
  idempotencyKey: string;
  payload: unknown;
}

const MAX_IDEMPOTENCY_KEY_LENGTH = 160; // varchar(160) del recibo y del outbox
const MAX_RECIPIENT_LENGTH = 254; // RFC 5321, y varchar del outbox emisor
const MAX_TEMPLATE_LENGTH = 160;

export function parseEmailOutboxDelivery(rawBody: Buffer): EmailOutboxDelivery {
  const body = parseJsonObject(rawBody);
  requireQueue(body, 'email');
  return {
    queue: 'email',
    idempotencyKey: requireBoundedString(
      body,
      'idempotencyKey',
      MAX_IDEMPOTENCY_KEY_LENGTH,
    ),
    recipient: requireBoundedString(body, 'recipient', MAX_RECIPIENT_LENGTH),
    template: requireBoundedString(body, 'template', MAX_TEMPLATE_LENGTH),
    payload: body.payload,
  };
}

export function parseDomainOutboxDelivery(
  rawBody: Buffer,
): DomainOutboxDelivery {
  const body = parseJsonObject(rawBody);
  requireQueue(body, 'domain');
  // MVP deliberado: sólo se exige lo que el receptor USA (la clave para el
  // recibo durable). `type`, `aggregateId` y `payload` viajan firmados y
  // quedarán exigidos cuando exista consumo real de eventos.
  return {
    queue: 'domain',
    idempotencyKey: requireBoundedString(
      body,
      'idempotencyKey',
      MAX_IDEMPOTENCY_KEY_LENGTH,
    ),
    payload: body.payload,
  };
}

function parseJsonObject(rawBody: Buffer): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new OutboxDeliveryParseError('El cuerpo firmado no es JSON válido.');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new OutboxDeliveryParseError('El cuerpo firmado no es un objeto.');
  }
  return parsed as Record<string, unknown>;
}

function requireQueue(
  body: Record<string, unknown>,
  expected: 'email' | 'domain',
): void {
  if (body.queue !== expected) {
    throw new OutboxDeliveryParseError(
      `El cuerpo firmado declara otra cola; este endpoint sólo acepta "${expected}".`,
    );
  }
}

function requireBoundedString(
  body: Record<string, unknown>,
  field: string,
  maxLength: number,
): string {
  const value = body[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new OutboxDeliveryParseError(
      `El cuerpo firmado no trae \`${field}\`.`,
    );
  }
  if (value.length > maxLength) {
    throw new OutboxDeliveryParseError(
      `\`${field}\` supera los ${maxLength} caracteres permitidos.`,
    );
  }
  return value;
}
