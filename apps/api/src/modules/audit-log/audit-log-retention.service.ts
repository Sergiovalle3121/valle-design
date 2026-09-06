import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DesignAuditLogEntry } from './entities/design-audit-log.entity';

/**
 * Retención de `design_audit_log` — 400 días (13 meses, más que un ciclo
 * anual de reporte) desde que se escribió el asiento.
 *
 * T-62(a): «no tiene retención ni purga: crece para siempre con correos
 * dentro» era el defecto exacto. El barrido corre EN TODAS las réplicas a
 * propósito, igual que `CadPresenceCleanupService`: un
 * `DELETE ... WHERE created_at < cutoff` es idempotente y no necesita lease
 * ni coordinación entre procesos.
 *
 * Deliberadamente NO tenant-scoped: purgar por antigüedad es housekeeping
 * global, no una lectura de negocio de un tenant — por eso inyecta el
 * repositorio TypeORM crudo (`@InjectRepository`), no
 * `TenantScopedRepository`, cuyo `delete()` de todos modos no lo cubre (ver
 * la cabecera de `tenant-scoped.repository.ts`).
 */
export const AUDIT_LOG_RETENTION_DAYS = 400;
const SWEEP_INTERVAL_MS = 24 * 60 * 60_000;

@Injectable()
export class AuditLogRetentionService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AuditLogRetentionService.name);
  private active = false;
  private timer?: NodeJS.Timeout;
  private current?: Promise<void>;

  constructor(
    @InjectRepository(DesignAuditLogEntry)
    private readonly repo: Repository<DesignAuditLogEntry>,
  ) {}

  onApplicationBootstrap(): void {
    this.active = true;
    this.schedule(SWEEP_INTERVAL_MS);
  }

  async onApplicationShutdown(): Promise<void> {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    await this.current;
  }

  async purgeOlderThan(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60_000);
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .from(DesignAuditLogEntry)
      .where('"created_at" < :cutoff', { cutoff })
      .execute();
    return result.affected ?? 0;
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
      const deleted = await this.purgeOlderThan(AUDIT_LOG_RETENTION_DAYS);
      if (deleted > 0) {
        this.logger.log(
          `Bitácora de auditoría: ${deleted} asiento(s) por encima de ${AUDIT_LOG_RETENTION_DAYS} días, purgado(s).`,
        );
      }
    } catch (error) {
      const kind =
        error instanceof Error ? error.name : 'AuditLogRetentionError';
      this.logger.warn(`Purga de bitácora de auditoría falló (${kind}).`);
    }
  }
}
