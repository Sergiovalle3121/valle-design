/**
 * LOS ERRORES DEL NAVEGADOR, HACIA SENTRY — y NADA si no hay DSN.
 *
 * El API ya reporta sus 5xx (`apps/api/src/observability`); la web no
 * reportaba nada: una excepción en el estudio de alguien terminaba en la
 * consola de SU navegador y en la pantalla «Algo se rompió de nuestro lado».
 * Nadie de este lado se enteraba. Esto es la mitad que faltaba, con las mismas
 * reglas que el API:
 *
 *  · Se decide por AUSENCIA: sin `NEXT_PUBLIC_SENTRY_DSN` no hay listener, ni
 *    envío, ni red. Desarrollo, E2E y cualquier despliegue sin proveedor se
 *    comportan igual que antes.
 *  · Sin SDK: un evento de error es un POST de un «envelope» NDJSON. El SDK
 *    oficial añadiría breadcrumbs, grabación de sesión y captura implícita de
 *    datos que el RUNBOOK prohíbe exportar, y peso en cada página.
 *  · Todo lo que sale se sanea: correos, tokens (los enlaces de revisión y de
 *    la demostración viajan en la URL), UUID de documentos y organizaciones,
 *    hashes y data URIs. De la página sólo sale la ruta, nunca la query ni el
 *    fragmento.
 *  · Techo por página y sin repetidos: un error dentro de un bucle de render
 *    no puede convertirse en mil peticiones.
 */

export interface SentryDsn {
  publicKey: string;
  host: string;
  projectId: string;
  protocol: string;
  path: string;
}

/** `https://<clave>@<host>/<proyecto>`, con ruta opcional (on-premise). */
export function parseSentryDsn(raw: string | undefined | null): SentryDsn | null {
  const value = (raw || "").trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.username) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const projectId = segments.pop();
  if (!projectId || !/^\d+$/.test(projectId)) return null;
  return {
    publicKey: url.username,
    host: url.host,
    projectId,
    protocol: url.protocol.replace(":", ""),
    path: segments.length ? `/${segments.join("/")}` : "",
  };
}

/** El origen que la CSP tiene que dejar pasar en `connect-src`. */
export function sentryOrigin(raw: string | undefined | null): string {
  const dsn = parseSentryDsn(raw);
  return dsn ? `${dsn.protocol}://${dsn.host}` : "";
}

export const REDACTED = "[redactado]";

const RULES: ReadonlyArray<[RegExp, string | ((match: string, ...groups: string[]) => string)]> = [
  [/\b([a-z][a-z0-9+.-]*):\/\/[^\s/@:]+:[^\s/@]*@/gi, (_m, scheme) => `${scheme}://${REDACTED}@`],
  [/\b[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+\b/g, REDACTED],
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, (_m, scheme) => `${scheme} ${REDACTED}`],
  [/\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g, REDACTED],
  // Tokens de enlace: revisión (`vdrl_`), demostración (`vdds_`, `vddm_`).
  [/\bvd[a-z]{2}_[A-Za-z0-9_-]{16,}/g, REDACTED],
  [
    /\b([A-Za-z0-9_.-]*(?:secret|password|passwd|token|api[_-]?key|signature|credential)[A-Za-z0-9_.-]*)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;)}\]]+)/gi,
    (_m, key) => `${key}=${REDACTED}`,
  ],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, REDACTED],
  [/\b[0-9a-f]{32,}\b/gi, REDACTED],
  [/\bdata:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, REDACTED],
];

const MAX_TEXT = 2_000;

export function scrubText(input: unknown): string {
  if (input === undefined || input === null) return "";
  let text = String(input);
  for (const [pattern, replacement] of RULES) {
    pattern.lastIndex = 0;
    text = text.replace(pattern, replacement as never);
  }
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…[truncado]` : text;
}

/** De la página sólo la ruta: la query y el fragmento llevan tokens. */
export function scrubPageUrl(href: string | undefined | null): string {
  if (!href) return "";
  try {
    const url = new URL(href);
    return scrubText(`${url.origin}${url.pathname}`);
  } catch {
    return "";
  }
}

export type ClientErrorSource = "window.error" | "unhandledrejection" | "error-boundary" | "global-error";

export interface ClientErrorReport {
  kind: string;
  message: string;
  stack?: string;
  source: ClientErrorSource;
  digest?: string;
  /** La zona de `components/ui/ErrorBoundary` que se cayó («Propiedades», …). */
  zone?: string;
}

/** Normaliza lo que llega a un listener: un Error, un string, un objeto cualquiera. */
export function toClientErrorReport(
  error: unknown,
  source: ClientErrorSource,
  extra: { digest?: string; zone?: string } = {},
): ClientErrorReport {
  if (error instanceof Error) {
    return { kind: error.name || "Error", message: error.message, stack: error.stack, source, ...extra };
  }
  return { kind: "NonError", message: typeof error === "string" ? error : safeJson(error), source, ...extra };
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Ruido que no es un fallo nuestro: el aviso benigno de ResizeObserver, el
 * «Script error.» opaco de un script de otro origen, lo que lanza una
 * extensión del navegador y una petición que el propio código canceló.
 */
export function isNoise(report: ClientErrorReport): boolean {
  if (/^ResizeObserver loop/iu.test(report.message)) return true;
  if (report.message === "Script error." || report.message === "Script error") return true;
  if (report.kind === "AbortError") return true;
  if (report.stack && /(chrome|moz|safari(-web)?)-extension:\/\//u.test(report.stack)) return true;
  return false;
}

export interface EnvelopeContext {
  dsn: SentryDsn;
  environment: string;
  release?: string;
  pageUrl: string;
  userAgent?: string;
  now: Date;
  eventId: string;
}

export function envelopeEndpoint(dsn: SentryDsn): string {
  // Autenticación en la query, como el SDK de navegador: con `text/plain` la
  // petición es «simple» y no hace preflight.
  const auth = new URLSearchParams({ sentry_key: dsn.publicKey, sentry_version: "7", sentry_client: "vallecad-web/1" });
  return `${dsn.protocol}://${dsn.host}${dsn.path}/api/${dsn.projectId}/envelope/?${auth}`;
}

export function buildEnvelope(report: ClientErrorReport, ctx: EnvelopeContext): string {
  const route = ctx.pageUrl ? new URL(ctx.pageUrl).pathname : undefined;
  const event = {
    event_id: ctx.eventId,
    timestamp: ctx.now.toISOString(),
    platform: "javascript",
    level: "error",
    logger: report.source,
    environment: ctx.environment,
    ...(ctx.release ? { release: ctx.release } : {}),
    request: {
      ...(ctx.pageUrl ? { url: ctx.pageUrl } : {}),
      ...(ctx.userAgent ? { headers: { "User-Agent": ctx.userAgent.slice(0, 300) } } : {}),
    },
    exception: {
      values: [
        {
          type: scrubText(report.kind).slice(0, 120),
          value: scrubText(report.message),
          ...(report.stack ? { stacktrace: { frames: [], raw: scrubText(report.stack.split("\n").slice(0, 31).join("\n")) } } : {}),
        },
      ],
    },
    tags: {
      source: report.source,
      ...(route ? { route } : {}),
      ...(report.digest ? { digest: scrubText(report.digest).slice(0, 64) } : {}),
      ...(report.zone ? { zona: scrubText(report.zone).slice(0, 64) } : {}),
    },
  };
  const payload = JSON.stringify(event);
  const header = JSON.stringify({ event_id: ctx.eventId, sent_at: ctx.now.toISOString() });
  const item = JSON.stringify({ type: "event", length: new TextEncoder().encode(payload).length, content_type: "application/json" });
  return `${header}\n${item}\n${payload}\n`;
}

export type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string; keepalive?: boolean }) => Promise<unknown>;

export interface ClientErrorReporterOptions {
  dsn: SentryDsn;
  fetchImpl: FetchLike;
  environment: string;
  release?: string;
  /** Techo de envíos por carga de página. */
  maxPerPage?: number;
  pageUrl?: () => string;
  userAgent?: () => string | undefined;
  now?: () => Date;
  eventId?: () => string;
}

export interface ClientErrorReporter {
  /** `true` si el evento salió; `false` si era ruido, repetido o pasó el techo. */
  report(report: ClientErrorReport): boolean;
}

export function createClientErrorReporter(options: ClientErrorReporterOptions): ClientErrorReporter {
  const maxPerPage = options.maxPerPage ?? 10;
  const seen = new Set<string>();
  let sent = 0;
  return {
    report(report) {
      if (isNoise(report) || sent >= maxPerPage) return false;
      const key = `${report.kind}|${report.message}|${(report.stack ?? "").split("\n").slice(0, 3).join("|")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      sent += 1;
      const body = buildEnvelope(report, {
        dsn: options.dsn,
        environment: options.environment,
        release: options.release,
        pageUrl: scrubPageUrl(options.pageUrl?.()),
        userAgent: options.userAgent?.(),
        now: (options.now ?? (() => new Date()))(),
        eventId: (options.eventId ?? randomEventId)(),
      });
      // La telemetría nunca lanza ni se espera: si Sentry no contesta, el
      // usuario no tiene por qué notarlo.
      void Promise.resolve()
        .then(() =>
          options.fetchImpl(envelopeEndpoint(options.dsn), {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=UTF-8" },
            body,
            keepalive: true,
          }),
        )
        .catch(() => undefined);
      return true;
    },
  };
}

function randomEventId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

let singleton: ClientErrorReporter | null | undefined;

/** El reporter de esta página, o `null` si el despliegue no tiene DSN. */
export function browserErrorReporter(): ClientErrorReporter | null {
  if (singleton !== undefined) return singleton;
  const dsn = typeof window === "undefined" ? null : parseSentryDsn(process.env.NEXT_PUBLIC_SENTRY_DSN);
  singleton =
    dsn && typeof fetch === "function"
      ? createClientErrorReporter({
          dsn,
          fetchImpl: (input, init) => fetch(input, init),
          environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "production",
          release: process.env.NEXT_PUBLIC_APP_VERSION?.trim() || undefined,
          pageUrl: () => window.location.href,
          userAgent: () => navigator.userAgent,
        })
      : null;
  return singleton;
}

/** Para las fronteras de error (`error.tsx`, `global-error.tsx`, `ErrorBoundary`). */
export function reportClientError(
  error: unknown,
  source: ClientErrorSource,
  extra: { digest?: string; zone?: string } = {},
): void {
  try {
    browserErrorReporter()?.report(toClientErrorReport(error, source, extra));
  } catch {
    // Un reporte que falla no puede tumbar la pantalla de recuperación.
  }
}
