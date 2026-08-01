import { EnterpriseCadAuditPublisher } from './enterprise-audit-publisher.adapter';
import { EventDomain } from '../event-ledger/entities/ledger-event.entity';
import type { EventLedgerService } from '../event-ledger/event-ledger.service';
import type { CadAuditEvent } from './ports/cad-audit-publisher.port';

const event: CadAuditEvent = {
  action: 'cad_document_saved',
  referenceType: 'SF_LINE_ENGINEERING',
  referenceId: 'AX-1000|A',
  actorName: 'ie@test',
  program: 'PGM-1',
  plant: 'plant-1',
  metadata: { beforeState: { v: 1 }, afterState: { v: 2 } },
};

describe('EnterpriseCadAuditPublisher (puerto CadAuditPublisher, WP2c)', () => {
  it('registra el asiento CAD sobre el event ledger (dominio ENGINEERING)', async () => {
    const recordEvent = jest.fn().mockResolvedValue(undefined);
    const publisher = new EnterpriseCadAuditPublisher({
      recordEvent,
    } as unknown as EventLedgerService);

    await publisher.record(event);

    expect(recordEvent).toHaveBeenCalledWith({
      actorName: 'ie@test',
      domain: EventDomain.ENGINEERING,
      action: 'cad_document_saved',
      referenceType: 'SF_LINE_ENGINEERING',
      referenceId: 'AX-1000|A',
      program: 'PGM-1',
      plant: 'plant-1',
      metadata: { beforeState: { v: 1 }, afterState: { v: 2 } },
    });
  });

  it('es fail-soft: sin ledger o con ledger fallando, la acción CAD no se rompe', async () => {
    await expect(
      new EnterpriseCadAuditPublisher().record(event),
    ).resolves.toBeUndefined();

    const failing = {
      recordEvent: jest.fn().mockRejectedValue(new Error('ledger caído')),
    } as unknown as EventLedgerService;
    await expect(
      new EnterpriseCadAuditPublisher(failing).record(event),
    ).resolves.toBeUndefined();
  });
});
