import { DesignCadAuditPublisher } from './design-audit-publisher.adapter';
import type { DesignAuditLog } from '../audit-log/design-audit-log.service';
import type { CadAuditEvent } from './ports/cad-audit-publisher.port';

const event: CadAuditEvent = {
  action: 'cad_document_saved',
  referenceType: 'CAD_DOCUMENT',
  referenceId: 'doc-1',
  actorName: 'cad@test',
  program: 'PGM-1',
  plant: 'plant-1',
  metadata: { beforeState: { v: 1 }, afterState: { v: 2 } },
};

describe('DesignCadAuditPublisher (puerto CadAuditPublisher)', () => {
  it('registra el asiento CAD en la bitácora propia design_audit_log', async () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const publisher = new DesignCadAuditPublisher({
      record,
    } as unknown as DesignAuditLog);

    await publisher.record(event);

    expect(record).toHaveBeenCalledWith({
      actor: 'cad@test',
      action: 'cad_document_saved',
      referenceType: 'CAD_DOCUMENT',
      referenceId: 'doc-1',
      payload: {
        program: 'PGM-1',
        plant: 'plant-1',
        metadata: { beforeState: { v: 1 }, afterState: { v: 2 } },
      },
    });
  });

  it('es fail-soft: sin bitácora o con bitácora fallando, la acción CAD no se rompe', async () => {
    await expect(
      new DesignCadAuditPublisher().record(event),
    ).resolves.toBeUndefined();

    const failing = {
      record: jest.fn().mockRejectedValue(new Error('bitácora caída')),
    } as unknown as DesignAuditLog;
    await expect(
      new DesignCadAuditPublisher(failing).record(event),
    ).resolves.toBeUndefined();
  });
});
