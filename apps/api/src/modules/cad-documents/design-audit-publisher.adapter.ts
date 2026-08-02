/**
 * Adaptador Design del puerto CadAuditPublisher (sustituye al adaptador
 * enterprise que escribía sobre el EventLedger).
 *
 * Registra los asientos CAD en la bitácora propia `design_audit_log`
 * (DesignAuditLog). FAIL-SOFT como el patrón del origen: sin bitácora
 * disponible o con error al escribir, la acción CAD no se rompe — se degrada
 * a un warn.
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { DesignAuditLog } from '../audit-log/design-audit-log.service';
import type {
  CadAuditEvent,
  CadAuditPublisher,
} from './ports/cad-audit-publisher.port';

@Injectable()
export class DesignCadAuditPublisher implements CadAuditPublisher {
  private readonly logger = new Logger(DesignCadAuditPublisher.name);

  constructor(@Optional() private readonly audit?: DesignAuditLog) {}

  async record(event: CadAuditEvent): Promise<void> {
    if (!this.audit) return;
    try {
      await this.audit.record({
        actor: event.actorName ?? null,
        action: event.action,
        referenceType: event.referenceType,
        referenceId: event.referenceId,
        payload: {
          ...(event.program ? { program: event.program } : {}),
          ...(event.plant ? { plant: event.plant } : {}),
          ...(event.metadata ? { metadata: event.metadata } : {}),
        },
      });
    } catch (err) {
      this.logger.warn(
        `Auditoría CAD omitida para ${event.action}: ${(err as Error)?.message}`,
      );
    }
  }
}
