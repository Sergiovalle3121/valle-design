import { Injectable } from '@nestjs/common';

/**
 * Registro de métricas en formato de exposición Prometheus (texto v0.0.4).
 *
 * Regla de admisión, y es la que decide qué hay aquí dentro: **sólo se publica
 * lo que este proceso puede medir HONESTAMENTE**. Una métrica inventada
 * —«usuarios activos» derivada de una heurística, «uptime del servicio»
 * cuando lo que se sabe es el uptime del proceso— es peor que no tener
 * métrica: se convierte en la base de una alerta que nadie puede depurar.
 *
 * Qué se mide y por qué se puede:
 * - peticiones por método/PATRÓN de ruta/estado: el middleware las cuenta
 *   cuando Express ya resolvió la ruta;
 * - latencia por ruta como HISTOGRAMA: p50 y p95 salen de
 *   `histogram_quantile(0.95, ...)` sobre los buckets. Un percentil calculado
 *   en el proceso NO es agregable entre réplicas — promediar percentiles de
 *   tres instancias no da el percentil del servicio— y por eso aquí se
 *   exportan buckets, no percentiles ya cocinados;
 * - profundidad y lag del outbox: son una consulta agregada a PostgreSQL,
 *   consistente entre réplicas;
 * - conexiones del pool: las publica el driver `pg` en el propio proceso.
 *
 * Cardinalidad: cada serie es un objeto vivo en memoria y en el TSDB. Las
 * etiquetas se limitan a método, patrón de ruta y estado; el patrón viene del
 * router (acotado) y hay tope explícito con cubeta de desborde, igual que en
 * `CommercialTelemetryService`.
 */

/**
 * Buckets en segundos. Elegidos sobre la forma real de este API: la mayoría
 * de rutas de identidad/organización responden en decenas de milisegundos y
 * un guardado CAS con documento grande se va a segundos. Sin el bucket de
 * 0.005 el p50 sería inservible; sin los de 5 y 10 el p95 saturaría en `+Inf`
 * justo cuando empieza a doler.
 */
export const DEFAULT_LATENCY_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
] as const;

const MAX_SERIES = 400;
const OVERFLOW_ROUTE = '(desbordado)';
/**
 * Separador de la clave compuesta (metodo/ruta/estado): el caracter ASCII
 * "unit separator". No puede aparecer en un metodo HTTP, en un patron de
 * ruta de Express ni en un codigo de estado, de modo que split() recupera
 * las tres piezas exactas aunque la ruta llevara espacios o comas.
 */
const KEY_SEPARATOR = String.fromCharCode(31);

interface HistogramSeries {
  counts: number[];
  sum: number;
  count: number;
}

export interface HttpObservation {
  method: string;
  route: string;
  statusCode: number;
  durationSeconds: number;
}

/** Fuente de números que el registro no puede calcular por sí mismo. */
export interface MetricsGauges {
  /** `valle_outbox_backlog{queue,status}`. */
  outboxBacklog: Array<{ queue: string; status: string; value: number }>;
  /** `valle_outbox_oldest_pending_age_seconds{queue}` — el LAG del outbox. */
  outboxOldestPendingAgeSeconds: Array<{ queue: string; value: number | null }>;
  /** Contadores del dispatcher por cola y evento. */
  outboxDispatch: Array<{ queue: string; event: string; value: number }>;
  /** Latencia claimed→sent acumulada por cola. */
  outboxDelivery: Array<{ queue: string; count: number; totalSeconds: number }>;
  /** Pool de PostgreSQL: total/idle/waiting. */
  dbPool: Array<{ state: string; value: number }>;
}

@Injectable()
export class MetricsRegistry {
  private readonly requests = new Map<string, number>();
  private readonly durations = new Map<string, HistogramSeries>();
  private readonly knownRoutes = new Set<string>();
  private readonly buckets = [...DEFAULT_LATENCY_BUCKETS];
  private readonly startedAtMs = Date.now();

  observeHttp(observation: HttpObservation): void {
    const route = this.boundedRoute(observation.route);
    const method = observation.method.toUpperCase();
    const status = String(observation.statusCode);

    const counterKey = [method, route, status].join(KEY_SEPARATOR);
    this.requests.set(counterKey, (this.requests.get(counterKey) ?? 0) + 1);

    const histogramKey = [method, route].join(KEY_SEPARATOR);
    let series = this.durations.get(histogramKey);
    if (!series) {
      series = {
        counts: new Array<number>(this.buckets.length + 1).fill(0),
        sum: 0,
        count: 0,
      };
      this.durations.set(histogramKey, series);
    }
    const seconds = Math.max(0, observation.durationSeconds);
    series.sum += seconds;
    series.count += 1;
    // Índice del primer bucket cuyo techo cubre la muestra; el último es +Inf.
    let index = this.buckets.findIndex((edge) => seconds <= edge);
    if (index === -1) index = this.buckets.length;
    series.counts[index] += 1;
  }

  /**
   * Una ruta nueva sólo crea serie si queda presupuesto; el resto cae en una
   * cubeta de desborde. Un endpoint mal instrumentado no puede hacer crecer
   * la memoria del proceso sin techo.
   */
  private boundedRoute(route: string): string {
    const clean = route && route.trim() ? route : OVERFLOW_ROUTE;
    if (this.knownRoutes.has(clean)) return clean;
    if (this.knownRoutes.size >= MAX_SERIES) return OVERFLOW_ROUTE;
    this.knownRoutes.add(clean);
    return clean;
  }

  /** Formato de exposición Prometheus. */
  render(gauges: MetricsGauges, now: number = Date.now()): string {
    const lines: string[] = [];

    lines.push(
      '# HELP valle_http_requests_total Peticiones HTTP atendidas, por metodo, patron de ruta y estado.',
      '# TYPE valle_http_requests_total counter',
    );
    for (const [key, value] of [...this.requests].sort(byKey)) {
      const [method, route, status] = key.split(KEY_SEPARATOR);
      lines.push(
        `valle_http_requests_total{method="${escapeLabel(method)}",route="${escapeLabel(route)}",status="${escapeLabel(status)}"} ${value}`,
      );
    }

    lines.push(
      '# HELP valle_http_request_duration_seconds Latencia de respuesta por metodo y patron de ruta.',
      '# TYPE valle_http_request_duration_seconds histogram',
    );
    for (const [key, series] of [...this.durations].sort(byKey)) {
      const [method, route] = key.split(KEY_SEPARATOR);
      const labels = `method="${escapeLabel(method)}",route="${escapeLabel(route)}"`;
      let cumulative = 0;
      for (let i = 0; i < this.buckets.length; i += 1) {
        cumulative += series.counts[i];
        lines.push(
          `valle_http_request_duration_seconds_bucket{${labels},le="${formatNumber(this.buckets[i])}"} ${cumulative}`,
        );
      }
      cumulative += series.counts[this.buckets.length];
      lines.push(
        `valle_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${cumulative}`,
        `valle_http_request_duration_seconds_sum{${labels}} ${formatNumber(series.sum)}`,
        `valle_http_request_duration_seconds_count{${labels}} ${series.count}`,
      );
    }

    lines.push(
      '# HELP valle_outbox_backlog Filas del outbox por cola y estado (consulta agregada, consistente entre replicas).',
      '# TYPE valle_outbox_backlog gauge',
    );
    for (const row of gauges.outboxBacklog) {
      lines.push(
        `valle_outbox_backlog{queue="${escapeLabel(row.queue)}",status="${escapeLabel(row.status)}"} ${row.value}`,
      );
    }

    lines.push(
      '# HELP valle_outbox_oldest_pending_age_seconds Edad del mensaje sin enviar mas antiguo (LAG del outbox).',
      '# TYPE valle_outbox_oldest_pending_age_seconds gauge',
    );
    for (const row of gauges.outboxOldestPendingAgeSeconds) {
      // `null` = no hay pendientes. Se publica 0 y NO se omite la serie: una
      // serie que desaparece dispara `absent()` y parece una caída del
      // exportador, no una cola vacía.
      lines.push(
        `valle_outbox_oldest_pending_age_seconds{queue="${escapeLabel(row.queue)}"} ${row.value ?? 0}`,
      );
    }

    lines.push(
      '# HELP valle_outbox_dispatch_total Eventos del dispatcher por cola (claimed, sent, retries, dead, lease_lost).',
      '# TYPE valle_outbox_dispatch_total counter',
    );
    for (const row of gauges.outboxDispatch) {
      lines.push(
        `valle_outbox_dispatch_total{queue="${escapeLabel(row.queue)}",event="${escapeLabel(row.event)}"} ${row.value}`,
      );
    }

    lines.push(
      '# HELP valle_outbox_delivery_seconds Latencia acumulada claimed a sent por cola.',
      '# TYPE valle_outbox_delivery_seconds summary',
    );
    for (const row of gauges.outboxDelivery) {
      const labels = `queue="${escapeLabel(row.queue)}"`;
      lines.push(
        `valle_outbox_delivery_seconds_sum{${labels}} ${formatNumber(row.totalSeconds)}`,
        `valle_outbox_delivery_seconds_count{${labels}} ${row.count}`,
      );
    }

    lines.push(
      '# HELP valle_db_pool_connections Conexiones del pool de PostgreSQL por estado.',
      '# TYPE valle_db_pool_connections gauge',
    );
    for (const row of gauges.dbPool) {
      lines.push(
        `valle_db_pool_connections{state="${escapeLabel(row.state)}"} ${row.value}`,
      );
    }

    lines.push(
      '# HELP valle_process_uptime_seconds Segundos desde el arranque de ESTE proceso (los contadores se reinician con el).',
      '# TYPE valle_process_uptime_seconds gauge',
      `valle_process_uptime_seconds ${formatNumber(Math.max(0, (now - this.startedAtMs) / 1000))}`,
    );

    return `${lines.join('\n')}\n`;
  }
}

function byKey(a: [string, unknown], b: [string, unknown]): number {
  return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
}

/** Escape del formato de exposición: `\`, `"` y salto de línea. */
function escapeLabel(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

/**
 * Representación decimal compacta. NO se usa `toFixed`: convertiría el techo
 * de bucket `0.01` en `0.010000`, y el `le` de un bucket es parte de la
 * IDENTIDAD de la serie — cambiarlo rompe cualquier consulta y cualquier
 * panel escrito contra la exposición anterior.
 */
function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return String(value);
}
