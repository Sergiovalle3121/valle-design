/**
 * Saneo de PII y secretos antes de que un texto salga del proceso.
 *
 * El RUNBOOK ya lo exige para métricas y logs: «no deben contener correos,
 * tokens, cuerpos CAD, tenant IDs, firmas ni respuestas del proveedor». Un
 * reporter de errores es justo el sitio donde esa regla se rompe sin querer,
 * porque lo que se envía no lo escribe un humano: es el `message` de una
 * excepción, y los drivers son generosos.
 *
 * Casos REALES de este repo que motivan cada patrón:
 * - `QueryFailedError` incluye la sentencia con los parámetros: un
 *   `SELECT … WHERE email = 'ana@empresa.com'` viaja entero;
 * - un fallo de conexión de `pg` imprime la URL con usuario y contraseña;
 * - un error de webhook puede arrastrar la firma HMAC o la Idempotency-Key;
 * - los identificadores de tenant/organización son UUID y aparecen en
 *   mensajes de 404/403.
 *
 * El criterio es *fail-safe*: ante la duda se redacta. Un reporte con
 * `[redactado]` sigue siendo accionable (clase de error, ruta, requestId);
 * un reporte con el correo de un cliente es un incidente de privacidad.
 */

export const REDACTED = '[redactado]';

interface Rule {
  readonly name: string;
  readonly pattern: RegExp;
  readonly replace: (match: string, ...groups: string[]) => string;
}

const RULES: Rule[] = [
  // Credenciales dentro de una URL de conexión: se conserva el esquema y el
  // host (diagnóstico real) y desaparece usuario:contraseña.
  {
    name: 'url-credenciales',
    pattern: /\b([a-z][a-z0-9+.-]*):\/\/[^\s/@:]+:[^\s/@]*@/gi,
    replace: (_m, scheme) => `${scheme}://${REDACTED}@`,
  },
  // Correos.
  {
    name: 'email',
    pattern: /\b[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+\b/g,
    replace: () => REDACTED,
  },
  // `Authorization: Bearer …`, `Basic …`.
  {
    name: 'authorization',
    pattern: /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    replace: (_m, scheme) => `${scheme} ${REDACTED}`,
  },
  // JWT de tres segmentos.
  {
    name: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g,
    replace: () => REDACTED,
  },
  // Cabecera Cookie / Set-Cookie completa (la sesión es opaca pero válida).
  {
    name: 'cookie',
    pattern: /\b(set-cookie|cookie)\s*[:=]\s*[^\n\r]+/gi,
    replace: (_m, header) => `${header}: ${REDACTED}`,
  },
  // Asignación a una clave sensible: secret=…, password: …, token="…".
  {
    name: 'clave-sensible',
    pattern:
      /\b([A-Za-z0-9_.-]*(?:secret|password|passwd|token|api[_-]?key|signature|credential)[A-Za-z0-9_.-]*)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;)}\]]+)/gi,
    replace: (_m, key) => `${key}=${REDACTED}`,
  },
  // UUID: tenant, organización, documento, usuario. Cardinalidad alta y
  // señala a UNA fila concreta, que es la definición operativa de PII aquí.
  {
    name: 'uuid',
    pattern:
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    replace: () => REDACTED,
  },
  // Hexadecimal largo: hashes de sesión, firmas HMAC, SHA-256 de blobs.
  {
    name: 'hex-largo',
    pattern: /\b[0-9a-f]{32,}\b/gi,
    replace: () => REDACTED,
  },
  // Cuerpo CAD y cualquier data URI: nunca acompañan a un error útil.
  {
    name: 'data-uri',
    pattern: /\bdata:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi,
    replace: () => REDACTED,
  },
];

/** Techo de longitud: un mensaje enorme es un payload, no una señal. */
export const MAX_SCRUBBED_LENGTH = 2_000;

export function scrubText(input: string | undefined | null): string {
  if (!input) return '';
  let text = String(input);
  for (const rule of RULES) {
    // `lastIndex` de un regex global es estado compartido entre llamadas.
    rule.pattern.lastIndex = 0;
    text = text.replace(rule.pattern, rule.replace as never);
  }
  if (text.length > MAX_SCRUBBED_LENGTH) {
    text = `${text.slice(0, MAX_SCRUBBED_LENGTH)}…[truncado]`;
  }
  return text;
}

/**
 * Sanea una traza CONSERVANDO su estructura: los nombres de archivo y las
 * líneas son lo único que hace útil un stack, y no son datos del usuario.
 */
export function scrubStack(
  stack: string | undefined,
  maxFrames = 30,
): string | undefined {
  if (!stack) return undefined;
  const lines = stack.split('\n').slice(0, maxFrames + 1);
  return lines.map((line) => scrubText(line)).join('\n');
}

/**
 * Sanea un mapa de etiquetas. Una clave sensible se redacta ENTERA sin mirar
 * su valor: `password: "1"` no se salva por ser corto.
 */
const SENSITIVE_KEY =
  /(secret|password|passwd|token|api[_-]?key|signature|credential|cookie|authorization|email|dsn)/i;

export function scrubTags(
  tags: Record<string, unknown> | undefined,
): Record<string, string> {
  if (!tags) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = REDACTED;
      continue;
    }
    out[key] = scrubText(
      typeof value === 'string' ? value : safeStringify(value),
    );
  }
  return out;
}

function safeStringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[objeto no serializable]';
    }
  }
  // Se enumeran los primitivos en vez de llamar `String(value)` sin más: un
  // valor con `toString` heredado produciría «[object Object]», que ocupa
  // sitio en el reporte y no dice nada.
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return `[${typeof value}]`;
}
