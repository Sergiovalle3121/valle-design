/**
 * Lectura TOLERANTE del payload de un evento de Stripe.
 *
 * Aislado del servicio a propósito: aquí vive todo lo que sabe de la FORMA de
 * los objetos del proveedor, y en ninguna otra parte. Dos razones concretas:
 *
 * - Stripe versiona su API y mueve campos de sitio (el identificador de la
 *   suscripción de una factura ha vivido en `subscription`, en
 *   `lines.data[].subscription` y en `parent.subscription_details.subscription`).
 *   Buscar en los tres sitios en un módulo con nombre propio es honesto;
 *   esparcir esa arqueología por el manejador transaccional, no.
 * - Un payload es entrada NO CONFIABLE aunque venga firmado: la firma prueba
 *   quién lo mandó, no que los tipos sean los esperados. Todo lo que sale de
 *   aquí está validado en forma y acotado en tamaño, así que el servicio nunca
 *   escribe en la base algo que no haya pasado por estas funciones.
 */

/** Objeto principal del evento: `data.object`. */
export function eventObject(payload: unknown): unknown {
  return readKey(readKey(payload, 'data'), 'object');
}

/**
 * Identificador de un recurso que Stripe expone como cadena o como objeto
 * expandido (`{ id: '…' }`).
 */
export function readReferenceId(value: unknown, key: string): string | null {
  const candidate = readKey(value, key);
  if (typeof candidate === 'string') return providerId(candidate);
  return providerId(readKey(candidate, 'id'));
}

export function readProviderId(value: unknown, key: string): string | null {
  return providerId(readKey(value, key));
}

/** Cadena corta y acotada (nombres, números de factura, estados). */
export function readShortString(
  value: unknown,
  key: string,
  maxLength: number,
): string | null {
  const candidate = readKey(value, key);
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

/** Metadata que nosotros mismos pusimos al crear el checkout. */
export function readMetadata(value: unknown, key: string): string | null {
  const metadata = readKey(value, 'metadata');
  const candidate = readKey(metadata, key);
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  return trimmed.length > 0 && trimmed.length <= 255 ? trimmed : null;
}

/** Moneda ISO-4217; Stripe la publica en minúsculas. */
export function readCurrency(value: unknown, key: string): string | null {
  const candidate = readKey(value, key);
  if (typeof candidate !== 'string') return null;
  const normalized = candidate.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

/**
 * Importe en céntimos. Se rechazan negativos, no enteros y valores fuera del
 * rango seguro de JavaScript: una factura con importe corrupto no se guarda a
 * medias, no se guarda.
 */
export function readAmountCents(value: unknown, keys: string[]): number | null {
  for (const key of keys) {
    const candidate = readKey(value, key);
    if (
      typeof candidate === 'number' &&
      Number.isSafeInteger(candidate) &&
      candidate >= 0
    ) {
      return candidate;
    }
  }
  return null;
}

/** Instante en segundos epoch (la unidad de tiempo de Stripe). */
export function readEpochSeconds(value: unknown, key: string): Date | null {
  const candidate = readKey(value, key);
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) return null;
  const seconds = Math.trunc(candidate);
  // Rango defensivo: entre 2001 y 2100. Un 0 o un valor absurdo entraría en la
  // columna como una fecha que después nadie sabría explicar.
  if (seconds < 1_000_000_000 || seconds > 4_102_444_800) return null;
  return new Date(seconds * 1000);
}

/** URL hospedada por el proveedor: sólo HTTPS, y acotada. */
export function readHttpsUrl(value: unknown, key: string): string | null {
  const candidate = readKey(value, key);
  if (typeof candidate !== 'string' || candidate.length > 2_048) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Primera línea de una factura (`lines.data[0]`), si la trae. */
export function firstInvoiceLine(invoice: unknown): unknown {
  const data = readKey(readKey(invoice, 'lines'), 'data');
  return Array.isArray(data) && data.length > 0 ? data[0] : undefined;
}

/**
 * Identificador de la suscripción asociada a una factura, buscándolo en los
 * sitios donde las distintas versiones de la API lo han publicado.
 */
export function invoiceSubscriptionId(invoice: unknown): string | null {
  const direct = readReferenceId(invoice, 'subscription');
  if (direct) return direct;
  const parent = readKey(invoice, 'parent');
  const details = readKey(parent, 'subscription_details');
  const fromParent = readReferenceId(details, 'subscription');
  if (fromParent) return fromParent;
  const line = firstInvoiceLine(invoice);
  const fromLine = readReferenceId(line, 'subscription');
  if (fromLine) return fromLine;
  const lineParent = readKey(line, 'parent');
  const lineDetails = readKey(lineParent, 'subscription_item_details');
  return readReferenceId(lineDetails, 'subscription');
}

/** Período facturado: el de la línea manda sobre el de la cabecera. */
export function invoicePeriod(invoice: unknown): {
  start: Date | null;
  end: Date | null;
} {
  const line = firstInvoiceLine(invoice);
  const linePeriod = readKey(line, 'period');
  const start =
    readEpochSeconds(linePeriod, 'start') ??
    readEpochSeconds(invoice, 'period_start');
  const end =
    readEpochSeconds(linePeriod, 'end') ??
    readEpochSeconds(invoice, 'period_end');
  // Un período invertido es un dato corrupto: se descarta entero en vez de
  // guardarlo y dejar que el CHECK de la tabla convierta el webhook en un 500.
  if (start && end && end < start) return { start: null, end: null };
  return { start, end };
}

function readKey(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return (value as Record<string, unknown>)[key];
}

/**
 * Identificador del proveedor: alfanumérico acotado. Sirve de saneo para todo
 * lo que después entra en columnas varchar(255) o en una URL.
 */
function providerId(candidate: unknown): string | null {
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  return /^[A-Za-z0-9_-]{1,255}$/.test(trimmed) ? trimmed : null;
}
