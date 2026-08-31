import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { CadPresenceRepository } from './cad-presence.repository';
import { CAD_PRESENCE_TTL_MS } from './cad-presence.service';

const SWEEP_INTERVAL_MS = 30_000;

/**
 * Barrido de TTL de `cad_presence_beats`.
 *
 * Sin esto, un documento visitado durante meses acumula una fila por cada
 * pestaña que alguna vez lo abrió: el snapshot ya las ignora (filtra por
 * `updated_at` dentro del TTL), así que ninguna correctness depende de este
 * barrido — es housekeeping puro, no una condición de carrera a evitar. Corre
 * en TODAS las réplicas a propósito: un `DELETE ... WHERE updated_at <
 * cutoff` es idempotente y no necesita lease ni coordinación (a diferencia
 * del worker de outbox, que si necesita `FOR UPDATE SKIP LOCKED` porque
 * ENTREGA cada fila una sola vez).
 */
@Injectable()
export class CadPresenceCleanupService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(CadPresenceCleanupService.name);
  private active = false;
  private timer?: NodeJS.Timeout;
  private current?: Promise<void>;

  constructor(private readonly repository: CadPresenceRepository) {}

  onApplicationBootstrap(): void {
    this.active = true;
    this.schedule(SWEEP_INTERVAL_MS);
  }

  async onApplicationShutdown(): Promise<void> {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    await this.current;
  }

  private schedule(delayMs: number): void {
    if (!this.active) return;
    this.timer = setTimeout(() => {
      this.current = this.sweep().finally(() => {
        this.current = undefined;
        this.schedule(SWEEP_INTERVAL_MS);
      });
    }, delayMs);
    this.timer.unref();
  }

  private async sweep(): Promise<void> {
    try {
      const deleted = await this.repository.deleteExpired(CAD_PRESENCE_TTL_MS);
      if (deleted > 0) {
        this.logger.debug(
          `Presencia CAD: ${deleted} latido(s) caducado(s) barrido(s).`,
        );
      }
    } catch (error) {
      const kind =
        error instanceof Error ? error.name : 'CadPresenceCleanupError';
      this.logger.warn(`Barrido de presencia CAD falló (${kind}).`);
    }
  }
}
