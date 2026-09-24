import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { CadDemoShareService } from './cad-demo-share.service';

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Barrido de `cad_demo_shares` caducados.
 *
 * Ninguna lectura depende de él —el canje comprueba `expires_at` en cada
 * petición y responde `demo_share_expired`—: es housekeeping para que las
 * copias de la demostración no se queden en la base más allá de sus siete
 * días. Mismo patrón que `CadPresenceCleanupService`: corre en todas las
 * réplicas porque un `DELETE … WHERE expires_at < now()` es idempotente.
 */
@Injectable()
export class CadDemoShareCleanupService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(CadDemoShareCleanupService.name);
  private active = false;
  private timer?: NodeJS.Timeout;
  private current?: Promise<void>;

  constructor(private readonly demoShares: CadDemoShareService) {}

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
      const deleted = await this.demoShares.deleteExpired();
      if (deleted > 0) {
        this.logger.debug(
          `Enlaces de la demostración: ${deleted} caducado(s) borrado(s).`,
        );
      }
    } catch (error) {
      const kind =
        error instanceof Error ? error.name : 'CadDemoShareCleanupError';
      this.logger.warn(
        `Barrido de enlaces de la demostración falló (${kind}).`,
      );
    }
  }
}
