/**
 * Adaptador enterprise del puerto CadAuditPublisher (WP2c).
 *
 * Registra los asientos CAD sobre el EventLedgerService (dominio ENGINEERING,
 * igual que los asientos que line-engineering escribe hoy). FAIL-SOFT como el
 * patrón existente: sin ledger disponible o con error al escribir, la acción
 * CAD no se rompe — se degrada a un warn. En este WP sólo queda cableado; los
 * call sites del ledger del ciclo legacy permanecen en line-engineering.
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventLedgerService } from '../event-ledger/event-ledger.service';
import { EventDomain } from '../event-ledger/entities/ledger-event.entity';
import type {
  CadAuditEvent,
  CadAuditPublisher,
} from './ports/cad-audit-publisher.port';

@Injectable()
export class EnterpriseCadAuditPublisher implements CadAuditPublisher {
  private readonly logger = new Logger(EnterpriseCadAuditPublisher.name);

  constructor(@Optional() private readonly ledger?: EventLedgerService) {}

  async record(event: CadAuditEvent): Promise<void> {
    if (!this.ledger) return;
    try {
      await this.ledger.recordEvent({
        actorName: event.actorName,
        domain: EventDomain.ENGINEERING,
        action: event.action,
        referenceType: event.referenceType,
        referenceId: event.referenceId,
        program: event.program,
        plant: event.plant,
        metadata: event.metadata,
      });
    } catch (err) {
      this.logger.warn(
        `Auditoría CAD omitida para ${event.action}: ${(err as Error)?.message}`,
      );
    }
  }
}
