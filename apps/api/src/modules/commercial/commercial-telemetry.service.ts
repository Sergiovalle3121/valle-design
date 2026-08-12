import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainOutbox, EmailOutbox } from './entities/commercial.entities';
import type {
  CommercialOutboxObservation,
  CommercialOutboxObserver,
  CommercialOutboxQueue,
} from './outbox-dispatcher.service';

/** Estados HTTP que el runbook pide vigilar por ruta. */
const TRACKED_HTTP_STATUSES = new Set([401, 403, 409, 429]);
/** Topes de cardinalidad: la telemetría jamás debe poder agotar memoria. */
const MAX_ROUTE_KEYS_PER_STATUS = 200;
const MAX_FAILURE_KINDS = 50;
const MAX_INFLIGHT_DELIVERIES = 1_000;
const OVERFLOW_KEY = '(desbordado)';

export interface DeliveryLatency {
  count: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
}

export interface QueueCounters {
  claimed: number;
  sent: number;
  retries: number;
  dead: number;
  leaseLost: number;
  retriesByKind: Record<string, number>;
  deadByKind: Record<string, number>;
  delivery: DeliveryLatency;
}

export interface QueueBacklog {
  byStatus: Record<string, number>;
  oldestUnsentAgeSeconds: number | null;
}

function emptyQueueCounters(): QueueCounters {
  return {
    claimed: 0,
    sent: 0,
    retries: 0,
    dead: 0,
    leaseLost: 0,
    retriesByKind: {},
    deadByKind: {},
    delivery: { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 },
  };
}

/**
 * Señales mínimas del RUNBOOK como contadores en memoria + una foto SQL del
 * backlog, expuestas por `GET /health/metrics/commercial`.
 *
 * Qué contiene y qué NO, por diseño:
 * - del dispatcher sólo viajan cola, contadores, clase de error y latencia
 *   (la interfaz CommercialOutboxObserver ya excluye destinatario, payload,
 *   tenant, organización e idempotency key — aquí ni siquiera se persiste el
 *   outboxId, sólo se usa para casar `claimed`→`sent` y medir latencia);
 * - de HTTP sólo el PATRÓN de ruta de Express (`/v1/cad/documents/:documentId`),
 *   nunca la URL real: los parámetros podrían llevar identificadores;
 * - el backlog se consulta con agregados (COUNT/MIN) sin leer payloads,
 *   la misma consulta que el runbook ejecuta a mano.
 *
 * Los contadores viven en el proceso (se reinician con cada despliegue) y cada
 * mapa tiene tope de cardinalidad con cubeta de desborde: una telemetría que
 * puede crecer sin límite es un incidente nuevo, no una señal.
 */
@Injectable()
export class CommercialTelemetryService implements CommercialOutboxObserver {
  private readonly startedAt = new Date();
  private readonly queues: Record<CommercialOutboxQueue, QueueCounters> = {
    domain: emptyQueueCounters(),
    email: emptyQueueCounters(),
  };
  /** claimed→sent por entrega en vuelo; Map conserva orden de inserción (LRU). */
  private readonly inflight = new Map<string, number>();
  private readonly httpByStatus = new Map<number, Map<string, number>>();

  constructor(
    @InjectRepository(DomainOutbox)
    private readonly domainOutbox: Repository<DomainOutbox>,
    @InjectRepository(EmailOutbox)
    private readonly emailOutbox: Repository<EmailOutbox>,
  ) {}

  observe(event: CommercialOutboxObservation): void {
    const counters = this.queues[event.queue];
    const inflightKey = `${event.queue}:${event.outboxId}`;
    switch (event.event) {
      case 'claimed':
        counters.claimed += 1;
        if (this.inflight.size >= MAX_INFLIGHT_DELIVERIES) {
          const oldest = this.inflight.keys().next().value;
          if (oldest !== undefined) this.inflight.delete(oldest);
        }
        this.inflight.set(inflightKey, Date.now());
        return;
      case 'sent':
        counters.sent += 1;
        this.recordDeliveryLatency(counters, inflightKey);
        return;
      case 'retry_scheduled':
        counters.retries += 1;
        bumpBounded(counters.retriesByKind, event.failureKind);
        this.inflight.delete(inflightKey);
        return;
      case 'dead':
        counters.dead += 1;
        bumpBounded(counters.deadByKind, event.failureKind);
        this.inflight.delete(inflightKey);
        return;
      case 'lease_lost':
        counters.leaseLost += 1;
        this.inflight.delete(inflightKey);
        return;
    }
  }

  /**
   * Cuenta un estado vigilado sobre el PATRÓN de ruta (nunca la URL real).
   * El middleware sólo la invoca para peticiones que casaron una ruta, así
   * que la cardinalidad queda acotada por el router — y por el tope local.
   */
  recordHttpStatus(status: number, method: string, routePath: string): void {
    if (!TRACKED_HTTP_STATUSES.has(status)) return;
    let routes = this.httpByStatus.get(status);
    if (!routes) {
      routes = new Map<string, number>();
      this.httpByStatus.set(status, routes);
    }
    const key = `${method.toUpperCase()} ${routePath}`;
    const bucket =
      routes.has(key) || routes.size < MAX_ROUTE_KEYS_PER_STATUS
        ? key
        : OVERFLOW_KEY;
    routes.set(bucket, (routes.get(bucket) ?? 0) + 1);
  }

  /** Foto completa para el endpoint de métricas. */
  async snapshot(): Promise<{
    time: string;
    startedAt: string;
    outbox: Record<CommercialOutboxQueue, QueueBacklog>;
    dispatcher: Record<CommercialOutboxQueue, QueueCounters>;
    http: Record<string, Record<string, number>>;
  }> {
    const [domain, email] = await Promise.all([
      this.queueBacklog(this.domainOutbox),
      this.queueBacklog(this.emailOutbox),
    ]);
    const http: Record<string, Record<string, number>> = {};
    for (const [status, routes] of this.httpByStatus) {
      http[String(status)] = Object.fromEntries(routes);
    }
    return {
      time: new Date().toISOString(),
      startedAt: this.startedAt.toISOString(),
      outbox: { domain, email },
      dispatcher: {
        domain: structuredClone(this.queues.domain),
        email: structuredClone(this.queues.email),
      },
      http,
    };
  }

  private recordDeliveryLatency(
    counters: QueueCounters,
    inflightKey: string,
  ): void {
    const claimedAt = this.inflight.get(inflightKey);
    this.inflight.delete(inflightKey);
    if (claimedAt === undefined) return;
    const elapsedMs = Math.max(0, Date.now() - claimedAt);
    counters.delivery.count += 1;
    counters.delivery.totalMs += elapsedMs;
    counters.delivery.maxMs = Math.max(counters.delivery.maxMs, elapsedMs);
    counters.delivery.lastMs = elapsedMs;
  }

  /** COUNT por estado + edad del no-enviado más viejo; nunca lee payloads. */
  private async queueBacklog(
    repository: Repository<DomainOutbox | EmailOutbox>,
  ): Promise<QueueBacklog> {
    const rows = await repository
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('o.status')
      .getRawMany<{ status: string; count: string | number }>();
    const byStatus: Record<string, number> = {};
    for (const row of rows) byStatus[row.status] = Number(row.count);

    const oldest = await repository
      .createQueryBuilder('o')
      .select('MIN(o.createdAt)', 'oldest')
      .where('o.status IN (:...statuses)', {
        statuses: ['pending', 'failed', 'processing'],
      })
      .getRawOne<{ oldest: string | Date | null }>();
    const oldestUnsentAgeSeconds = oldest?.oldest
      ? Math.max(
          0,
          Math.round((Date.now() - toDate(oldest.oldest).getTime()) / 1000),
        )
      : null;
    return { byStatus, oldestUnsentAgeSeconds };
  }
}

/** SQLite devuelve `datetime` como texto UTC sin zona; PostgreSQL, Date. */
function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const normalized = /[zZ]|[+-]\d{2}:\d{2}$/.test(value)
    ? value
    : `${value.replace(' ', 'T')}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? new Date(value) : parsed;
}

function bumpBounded(target: Record<string, number>, kind: string): void {
  const key =
    kind in target || Object.keys(target).length < MAX_FAILURE_KINDS
      ? kind
      : OVERFLOW_KEY;
  target[key] = (target[key] ?? 0) + 1;
}
