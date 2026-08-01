import { Inject, Injectable } from '@nestjs/common';
import { DesignAuditLogEntry } from './entities/design-audit-log.entity';
import {
  TenantScopedRepository,
  getTenantRepositoryToken,
} from '../../common/tenant/tenant-scoped.repository';
import { TenantContextService } from '../../common/tenant/tenant-context.service';

/** Asiento a registrar. Tenant y actor por defecto salen del contexto. */
export interface DesignAuditEntryInput {
  action: string;
  referenceType?: string | null;
  referenceId?: string | null;
  /** Actor explícito (jobs/adaptadores); default: email del contexto. */
  actor?: string | null;
  payload?: Record<string, unknown> | null;
}

/**
 * Bitácora server-owned de Design. Escribe SIEMPRE (lanza si la base falla):
 * la degradación fail-soft es responsabilidad del adaptador que la consuma
 * (DesignCadAuditPublisher), igual que el patrón ledger del origen.
 */
@Injectable()
export class DesignAuditLog {
  constructor(
    @Inject(getTenantRepositoryToken(DesignAuditLogEntry))
    private readonly repo: TenantScopedRepository<DesignAuditLogEntry>,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async record(entry: DesignAuditEntryInput): Promise<DesignAuditLogEntry> {
    const context = this.tenantCtx.get();
    const row = this.repo.create({
      // El repo scoped estampa tenant desde el contexto; aquí solo el resto.
      actor:
        entry.actor !== undefined ? entry.actor : (context?.user_email ?? null),
      action: entry.action,
      referenceType: entry.referenceType ?? null,
      referenceId: entry.referenceId ?? null,
      payload: entry.payload ?? null,
    });
    return this.repo.save(row);
  }

  /** Últimos asientos del tenant en contexto (más recientes primero). */
  async recent(limit = 50): Promise<DesignAuditLogEntry[]> {
    return this.repo.find({
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(1, limit), 200),
    });
  }
}
