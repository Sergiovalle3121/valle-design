import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CommercialTelemetryService } from '../modules/commercial/commercial-telemetry.service';
import type { MetricsGauges } from './metrics.registry';

/**
 * Traduce a gauges de Prometheus lo que OTROS componentes ya miden.
 *
 * No mide nada nuevo a propósito: el backlog del outbox y los contadores del
 * dispatcher ya viven en `CommercialTelemetryService` (que es quien recibe los
 * eventos del dispatcher y consulta la base), y el estado del pool lo publica
 * el driver `pg`. Duplicar la instrumentación produciría dos números con el
 * mismo nombre y distinto valor, que es la peor forma de no tener métricas.
 *
 * El acceso al pool es DEFENSIVO: con SQLite (desarrollo) no hay pool alguno,
 * y una excepción aquí convertiría `/metrics` —el endpoint al que se acude
 * cuando algo va mal— en otra cosa que falla.
 */
@Injectable()
export class MetricsGaugesProvider {
  constructor(
    private readonly telemetry: CommercialTelemetryService,
    private readonly dataSource: DataSource,
  ) {}

  async collect(): Promise<MetricsGauges> {
    const snapshot = await this.telemetry.snapshot();

    const outboxBacklog: MetricsGauges['outboxBacklog'] = [];
    const outboxOldestPendingAgeSeconds: MetricsGauges['outboxOldestPendingAgeSeconds'] =
      [];
    for (const [queue, backlog] of Object.entries(snapshot.outbox)) {
      for (const [status, value] of Object.entries(backlog.byStatus)) {
        outboxBacklog.push({ queue, status, value });
      }
      outboxOldestPendingAgeSeconds.push({
        queue,
        value: backlog.oldestUnsentAgeSeconds,
      });
    }

    const outboxDispatch: MetricsGauges['outboxDispatch'] = [];
    const outboxDelivery: MetricsGauges['outboxDelivery'] = [];
    for (const [queue, counters] of Object.entries(snapshot.dispatcher)) {
      outboxDispatch.push(
        { queue, event: 'claimed', value: counters.claimed },
        { queue, event: 'sent', value: counters.sent },
        { queue, event: 'retry_scheduled', value: counters.retries },
        { queue, event: 'dead', value: counters.dead },
        { queue, event: 'lease_lost', value: counters.leaseLost },
      );
      outboxDelivery.push({
        queue,
        count: counters.delivery.count,
        totalSeconds: counters.delivery.totalMs / 1000,
      });
    }

    return {
      outboxBacklog,
      outboxOldestPendingAgeSeconds,
      outboxDispatch,
      outboxDelivery,
      dbPool: this.poolGauges(),
    };
  }

  /**
   * `pg` expone en su Pool `totalCount` (creadas), `idleCount` (libres) y
   * `waitingCount` (peticiones esperando conexión). El tercero es la señal
   * que importa: si crece de forma sostenida, el pool es el cuello de
   * botella y ninguna métrica de latencia por ruta lo dice por sí sola.
   */
  private poolGauges(): MetricsGauges['dbPool'] {
    try {
      const driver = this.dataSource.driver as unknown as {
        master?: {
          totalCount?: unknown;
          idleCount?: unknown;
          waitingCount?: unknown;
        };
      };
      const pool = driver?.master;
      if (!pool) return [];
      const numeric = (value: unknown): number | null =>
        typeof value === 'number' && Number.isFinite(value) ? value : null;
      const total = numeric(pool.totalCount);
      const idle = numeric(pool.idleCount);
      const waiting = numeric(pool.waitingCount);
      const gauges: MetricsGauges['dbPool'] = [];
      if (total !== null) gauges.push({ state: 'total', value: total });
      if (idle !== null) gauges.push({ state: 'idle', value: idle });
      if (total !== null && idle !== null) {
        gauges.push({ state: 'active', value: Math.max(0, total - idle) });
      }
      if (waiting !== null) gauges.push({ state: 'waiting', value: waiting });
      return gauges;
    } catch {
      // Sin pool (SQLite en desarrollo) no hay serie que publicar. Publicar
      // ceros afirmaría que el pool existe y está vacío, que es distinto.
      return [];
    }
  }
}
