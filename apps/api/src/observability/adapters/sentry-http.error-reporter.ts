import { randomBytes } from 'node:crypto';
import type { ErrorReport, ErrorReporter } from '../error-reporter.port';
import { scrubStack, scrubTags, scrubText } from '../scrub';

/**
 * Adaptador compatible con Sentry por HTTP, SIN dependencia nueva.
 *
 * El protocolo de ingesta de Sentry es un POST de un "envelope" (NDJSON) a
 * `https://<host>/api/<projectId>/envelope/` con la clave pública en la
 * cabecera `X-Sentry-Auth`. Eso es todo lo que hace falta para un evento de
 * error, y cabe en este archivo. El SDK oficial aporta instrumentación
 * automática, breadcrumbs y perfiles — capacidades que este repo no ha
 * decidido querer, a cambio de una dependencia de producción con superficie
 * amplia y captura implícita de datos que el RUNBOOK prohíbe exportar.
 *
 * `fetch` se INYECTA: sin eso, un adaptador de red no se puede probar sin red,
 * y este repo exige que ninguna spec toque Internet.
 *
 * Contrato de seguridad: todo lo que sale pasa por `scrub*`. El emisor ya
 * sanea; aquí se vuelve a hacer a propósito, porque este es el último punto
 * antes de que un byte cruce el proceso y no se puede depender de que todos
 * los llamantes se acuerden.
 */

export interface SentryDsn {
  publicKey: string;
  host: string;
  projectId: string;
  protocol: string;
  path: string;
}

/**
 * DSN: `https://<publicKey>@<host>/<projectId>` (con path opcional para
 * instalaciones on-premise: `https://key@host/ruta/projectId`).
 */
export function parseSentryDsn(raw: string): SentryDsn | null {
  const value = (raw || '').trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const publicKey = url.username;
  if (!publicKey) return null;
  const segments = url.pathname.split('/').filter(Boolean);
  const projectId = segments.pop();
  if (!projectId || !/^\d+$/.test(projectId)) return null;
  return {
    publicKey,
    host: url.host,
    projectId,
    protocol: url.protocol.replace(':', ''),
    path: segments.length ? `/${segments.join('/')}` : '',
  };
}

export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number }>;

export interface SentryHttpErrorReporterOptions {
  dsn: SentryDsn;
  fetchImpl: FetchLike;
  environment: string;
  release?: string;
  serverName?: string;
  timeoutMs?: number;
  /** Techo de eventos en vuelo: la telemetría no puede tumbar el proceso. */
  maxInFlight?: number;
  onTransportError?: (kind: string) => void;
  now?: () => Date;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_IN_FLIGHT = 16;

export class SentryHttpErrorReporter implements ErrorReporter {
  private readonly options: Required<
    Pick<
      SentryHttpErrorReporterOptions,
      'timeoutMs' | 'maxInFlight' | 'environment'
    >
  > &
    SentryHttpErrorReporterOptions;
  private readonly inFlight = new Set<Promise<void>>();
  private droppedForBackpressure = 0;

  constructor(options: SentryHttpErrorReporterOptions) {
    this.options = {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      maxInFlight: DEFAULT_MAX_IN_FLIGHT,
      ...options,
    };
  }

  get endpoint(): string {
    const { protocol, host, path, projectId } = this.options.dsn;
    return `${protocol}://${host}${path}/api/${projectId}/envelope/`;
  }

  get dropped(): number {
    return this.droppedForBackpressure;
  }

  report(report: ErrorReport): void {
    // Contrapresión: si el backend está lento, encolar sin límite convierte
    // una incidencia de telemetría en una fuga de memoria del API.
    if (this.inFlight.size >= this.options.maxInFlight) {
      this.droppedForBackpressure += 1;
      return;
    }
    const body = this.envelope(report);
    const task = this.send(body).finally(() => {
      this.inFlight.delete(task);
    });
    this.inFlight.add(task);
    // `report()` no devuelve promesa a propósito: el camino de la petición no
    // espera a la telemetría.
    void task;
  }

  async flush(): Promise<void> {
    await Promise.allSettled([...this.inFlight]);
  }

  /** Envelope NDJSON: cabecera, cabecera de item y payload del evento. */
  envelope(report: ErrorReport): string {
    const now = (this.options.now ?? (() => new Date()))();
    const eventId = randomEventId();
    const event = {
      event_id: eventId,
      timestamp: now.toISOString(),
      platform: 'node',
      level: report.level,
      logger: report.source,
      environment: this.options.environment,
      ...(this.options.release ? { release: this.options.release } : {}),
      ...(this.options.serverName
        ? { server_name: this.options.serverName }
        : {}),
      exception: {
        values: [
          {
            type: scrubText(report.kind),
            value: scrubText(report.message),
            ...(report.stack
              ? { stacktrace: { frames: [], raw: scrubStack(report.stack) } }
              : {}),
          },
        ],
      },
      tags: scrubTags({
        source: report.source,
        ...(report.route ? { route: report.route } : {}),
        ...(report.method ? { method: report.method } : {}),
        ...(report.statusCode
          ? { status_code: String(report.statusCode) }
          : {}),
        ...(report.requestId ? { request_id: report.requestId } : {}),
        ...report.tags,
      }),
    };
    const header = JSON.stringify({
      event_id: eventId,
      sent_at: now.toISOString(),
      dsn: `${this.options.dsn.protocol}://${this.options.dsn.publicKey}@${this.options.dsn.host}${this.options.dsn.path}/${this.options.dsn.projectId}`,
    });
    const payload = JSON.stringify(event);
    const itemHeader = JSON.stringify({
      type: 'event',
      length: Buffer.byteLength(payload, 'utf8'),
      content_type: 'application/json',
    });
    return `${header}\n${itemHeader}\n${payload}\n`;
  }

  private async send(body: string): Promise<void> {
    const controller =
      typeof AbortController === 'function' ? new AbortController() : undefined;
    const timer = controller
      ? setTimeout(() => controller.abort(), this.options.timeoutMs)
      : undefined;
    try {
      const response = await this.options.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
          'X-Sentry-Auth': [
            'Sentry sentry_version=7',
            'sentry_client=valle-design-api/1',
            `sentry_key=${this.options.dsn.publicKey}`,
          ].join(', '),
        },
        body,
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!response.ok) {
        this.options.onTransportError?.(`HTTP_${response.status}`);
      }
    } catch (error) {
      // El texto del error NO se registra: puede contener la URL del DSN con
      // la clave pública o la respuesta del proveedor.
      const kind = error instanceof Error ? error.name : 'TransportError';
      this.options.onTransportError?.(kind);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

/** 32 hex sin guiones, como pide el protocolo de envelope. */
function randomEventId(): string {
  return randomBytes(16).toString('hex');
}
