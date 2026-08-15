import type { HelmetOptions } from 'helmet';

/**
 * Parámetros de endurecimiento del servidor HTTP productivo.
 *
 * Viven en funciones puras y no dentro de `main.ts` por una razón práctica:
 * `main.ts` arranca un proceso entero y no se puede ejercer en una spec. Las
 * decisiones que aquí se toman —cuánto dura un keep-alive, qué tamaño de
 * cuerpo se acepta, qué cabeceras se emiten— son exactamente las que hay que
 * poder verificar sin levantar nada.
 */

export interface ServerTimeouts {
  /** Cuánto se mantiene viva una conexión ociosa. */
  keepAliveTimeoutMs: number;
  /** Plazo para recibir las cabeceras completas. */
  headersTimeoutMs: number;
  /** Plazo total de una petición antes de abortarla. */
  requestTimeoutMs: number;
  /** Espera tras marcar readiness=503 antes de cerrar el listener. */
  drainDelayMs: number;
  /** Techo del apagado ordenado completo. */
  shutdownGraceMs: number;
}

/**
 * Por qué estos números y no otros:
 *
 * · `keepAliveTimeout` (65 s) DEBE superar el idle timeout del balanceador
 *   (60 s en ALB, nginx y la mayoría de PaaS). Si el servidor cierra primero,
 *   existe una ventana en la que el proxy manda una petición por una conexión
 *   que el servidor acaba de cerrar: el proxy no puede saber si llegó a
 *   ejecutarse, así que no la reintenta y devuelve 502. Es la causa clásica
 *   de "502 esporádicos sin nada en los logs de la aplicación".
 * · `headersTimeout` > `keepAliveTimeout`: Node cuenta el plazo de cabeceras
 *   desde que la conexión se establece. Si fuera menor, mataría conexiones
 *   keep-alive sanas que aún no han mandado su siguiente petición.
 * · `requestTimeout` (120 s) es un techo, no un objetivo: un guardado CAD con
 *   documento grande sobre una red lenta tarda; una petición colgada para
 *   siempre retiene un socket, memoria y una conexión de pool.
 * · `drainDelay` (5 s) debe cubrir al menos un ciclo de health check del
 *   balanceador (típicamente 2-3 s). Es el tiempo que tarda en ENTERARSE de
 *   que esta réplica dice 503.
 * · `shutdownGrace` (25 s) queda por debajo del `stopTimeout` habitual de los
 *   orquestadores (30 s), para que el proceso termine por decisión propia y
 *   no por SIGKILL: un SIGKILL deja el pool sin cerrar y transacciones a
 *   medias.
 */
export const DEFAULT_SERVER_TIMEOUTS: ServerTimeouts = {
  keepAliveTimeoutMs: 65_000,
  headersTimeoutMs: 70_000,
  requestTimeoutMs: 120_000,
  drainDelayMs: 5_000,
  shutdownGraceMs: 25_000,
};

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function serverTimeoutsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ServerTimeouts {
  const keepAliveTimeoutMs = positiveInt(
    env.HTTP_KEEP_ALIVE_TIMEOUT_MS,
    DEFAULT_SERVER_TIMEOUTS.keepAliveTimeoutMs,
  );
  const headersTimeoutMs = positiveInt(
    env.HTTP_HEADERS_TIMEOUT_MS,
    DEFAULT_SERVER_TIMEOUTS.headersTimeoutMs,
  );
  return {
    keepAliveTimeoutMs,
    // Invariante no negociable: aunque alguien configure mal las variables,
    // headers SIEMPRE por encima de keep-alive (ver arriba).
    headersTimeoutMs: Math.max(headersTimeoutMs, keepAliveTimeoutMs + 1_000),
    requestTimeoutMs: positiveInt(
      env.HTTP_REQUEST_TIMEOUT_MS,
      DEFAULT_SERVER_TIMEOUTS.requestTimeoutMs,
    ),
    drainDelayMs: positiveInt(
      env.SHUTDOWN_DRAIN_DELAY_MS,
      DEFAULT_SERVER_TIMEOUTS.drainDelayMs,
    ),
    shutdownGraceMs: positiveInt(
      env.SHUTDOWN_GRACE_MS,
      DEFAULT_SERVER_TIMEOUTS.shutdownGraceMs,
    ),
  };
}

/** Superficie mínima de `http.Server` que se configura. */
export interface TimeoutConfigurableServer {
  keepAliveTimeout: number;
  headersTimeout: number;
  requestTimeout: number;
}

export function applyServerTimeouts(
  server: TimeoutConfigurableServer,
  timeouts: ServerTimeouts,
): void {
  server.keepAliveTimeout = timeouts.keepAliveTimeoutMs;
  server.headersTimeout = timeouts.headersTimeoutMs;
  server.requestTimeout = timeouts.requestTimeoutMs;
}

/**
 * Límite del cuerpo JSON. El documento canónico inline admite hasta 8 000 000
 * bytes serializados; el margen cubre el framing JSON sin aceptar payloads sin
 * tope (un `Content-Length` sin techo es una denegación de servicio de una
 * línea).
 */
export const JSON_BODY_LIMIT = '16mb';

/**
 * Cabeceras de seguridad.
 *
 * La API sirve EXCLUSIVAMENTE JSON: no hay plantillas, ni estáticos, ni
 * `@Render`. Eso permite la CSP más estricta que existe —`default-src 'none'`—
 * en vez del `'self'` que Helmet trae por defecto pensando en aplicaciones que
 * sirven HTML. Si una respuesta de la API llega a interpretarse como documento
 * (por ejemplo, un JSON servido con el content-type equivocado ante un
 * navegador antiguo), esta política impide que cargue absolutamente nada.
 *
 * HSTS sólo en producción, y con un año e `includeSubDomains`: en desarrollo
 * la API se sirve por HTTP en localhost y un HSTS emitido allí fija el dominio
 * en el navegador del desarrollador durante meses. `preload` NO se activa: es
 * una decisión con vuelta atrás medida en meses y pertenece al dominio, no a
 * este proceso.
 */
export function helmetOptions(
  env: NodeJS.ProcessEnv = process.env,
): HelmetOptions {
  const isProduction = env.NODE_ENV === 'production';
  return {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
        'frame-ancestors': ["'none'"],
        sandbox: [],
      },
    },
    // La API es un origen distinto del web: CORP `same-origin` (el default de
    // Helmet) rompería cualquier consumo cross-origin legítimo. El control de
    // quién puede leer estas respuestas es CORS + ALLOWED_ORIGIN, que sí sabe
    // de orígenes concretos.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // Sin páginas HTML, COEP sólo añadiría cabeceras inútiles.
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
    hsts: isProduction
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: false }
      : false,
  };
}
