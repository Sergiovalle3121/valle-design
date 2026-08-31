import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import { CadPresenceBeat } from './entities/cad-presence-beat.entity';
import { CadPresenceRepository } from './cad-presence.repository';

const ENTITIES = [CadPresenceBeat];

/**
 * `CadPresenceRepository` contra PostgreSQL real: el upsert por
 * `(tenant, documento, peer)` de verdad sobrescribe (no acumula filas), el
 * snapshot de verdad respeta el TTL, y el barrido de verdad borra sólo lo
 * caducado. Mock o SQLite no ejercen la restricción `UNIQUE` real que hace
 * el upsert atómico bajo `ON CONFLICT`.
 */
describePostgres('CadPresenceRepository (PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let harness: PostgresHarness;
  let source: DataSource;
  let repository: CadPresenceRepository;
  let tenantId: string;
  let documentId: string;

  beforeAll(async () => {
    harness = await createPostgresHarness(ENTITIES, {
      schemaPrefix: 'cad_presence_repo',
    });
    source = harness.dataSource;
  });

  afterAll(async () => harness.destroy());

  beforeEach(async () => {
    await harness.truncateAll();
    tenantId = randomUUID();
    documentId = randomUUID();
    repository = new CadPresenceRepository(
      source.getRepository(CadPresenceBeat),
    );
  });

  it('el upsert por (tenant, documento, peer) SOBRESCRIBE, nunca acumula', async () => {
    await repository.upsert(tenantId, documentId, {
      peerId: 'peer-1',
      name: 'sergio',
      cursor: { x: 1, y: 1 },
      viewport: null,
    });
    await repository.upsert(tenantId, documentId, {
      peerId: 'peer-1',
      name: 'sergio',
      cursor: { x: 42, y: 7 },
      viewport: null,
    });

    const rows = await source.getRepository(CadPresenceBeat).find({
      where: { tenant_id: tenantId, documentId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].cursorX).toBe(42);
    expect(rows[0].cursorY).toBe(7);
  });

  it('el snapshot excluye latidos más viejos que el TTL', async () => {
    await repository.upsert(tenantId, documentId, {
      peerId: 'peer-vivo',
      name: 'vivo',
      cursor: null,
      viewport: null,
    });
    await repository.upsert(tenantId, documentId, {
      peerId: 'peer-caducado',
      name: 'caducado',
      cursor: null,
      viewport: null,
    });
    // Simula el paso del tiempo sobre UNA fila (el reloj del test no se mueve).
    await source.query(
      `UPDATE "${harness.schema}"."cad_presence_beats" SET "updated_at" = now() - interval '1 minute' WHERE "peer_id" = $1`,
      ['peer-caducado'],
    );

    const snapshot = await repository.snapshot(tenantId, documentId, 12_000);
    expect(snapshot.map((row) => row.peerId)).toEqual(['peer-vivo']);
  });

  it('deleteExpired barre SÓLO lo caducado, cruzando tenants (es housekeeping global)', async () => {
    const otherTenant = randomUUID();
    await repository.upsert(tenantId, documentId, {
      peerId: 'peer-vivo',
      name: 'vivo',
      cursor: null,
      viewport: null,
    });
    await repository.upsert(otherTenant, documentId, {
      peerId: 'peer-caducado-otro-tenant',
      name: 'caducado',
      cursor: null,
      viewport: null,
    });
    await source.query(
      `UPDATE "${harness.schema}"."cad_presence_beats" SET "updated_at" = now() - interval '1 minute' WHERE "peer_id" = $1`,
      ['peer-caducado-otro-tenant'],
    );

    const deleted = await repository.deleteExpired(12_000);
    expect(deleted).toBe(1);

    const remaining = await source.getRepository(CadPresenceBeat).find();
    expect(remaining.map((row) => row.peerId)).toEqual(['peer-vivo']);
  });
});
