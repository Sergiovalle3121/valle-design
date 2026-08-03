import { createHash, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import {
  TenantContextService,
  type TenantContext,
} from '../../common/tenant/tenant-context.service';
import { createTenantScopedRepository } from '../../common/tenant/tenant-scoped.repository';
import { DatabaseBlobStore } from '../blob-store/design-blob.store';
import { DesignBlob } from '../blob-store/entities/design-blob.entity';
import { CadDocumentsService } from '../cad-documents/cad-documents.service';
import { DesignBlobStoreAdapter } from '../cad-documents/design-blob-store.adapter';
import { CadDocument } from '../cad-documents/entities/cad-document.entity';
import { CadDocumentVersion } from '../cad-documents/entities/cad-document-version.entity';
import { CadProject } from '../cad-documents/entities/cad-project.entity';
import { CadPublication } from '../cad-documents/entities/cad-publication.entity';
import {
  PostgresCadEventPublisher,
  PostgresUsageMeter,
} from '../commercial/adapters/postgres.adapters';
import {
  DomainOutbox,
  UsageLedger,
} from '../commercial/entities/commercial.entities';
import { IdempotencyConflictError } from '../commercial/payload-hash';
import { User } from '../identity/entities/identity.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { CadDocumentsRepository } from './cad-documents.repository';

const ENTITIES = [
  User,
  Organization,
  CadProject,
  CadDocument,
  CadDocumentVersion,
  CadPublication,
  DesignBlob,
  UsageLedger,
  DomainOutbox,
];

describePostgres('CAD persistence atomicity (PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let harness: PostgresHarness;
  let source: DataSource;
  let tenant: TenantContextService;
  let blobs: DatabaseBlobStore;
  let cadDocuments: CadDocumentsService;
  let usage: PostgresUsageMeter;
  let events: PostgresCadEventPublisher;
  let repository: CadDocumentsRepository;
  let organizationId: string;

  beforeAll(async () => {
    harness = await createPostgresHarness(ENTITIES, {
      schemaPrefix: 'cad_persistence',
    });
    source = harness.dataSource;
  });

  afterAll(async () => harness.destroy());

  beforeEach(async () => {
    await harness.truncateAll();
    const user = await source.getRepository(User).save({
      email: `cad-${randomUUID()}@test.invalid`,
      displayName: 'CAD persistence test',
      emailVerifiedAt: new Date(),
    });
    const organization = await source.getRepository(Organization).save({
      name: 'CAD persistence organization',
      slug: `cad-${randomUUID()}`,
      ownerUserId: user.id,
    });
    organizationId = organization.id;

    tenant = new TenantContextService();
    const scoped = <T extends object>(entity: new () => T) =>
      createTenantScopedRepository(entity, source.manager, tenant, {
        strict: true,
      });
    blobs = new DatabaseBlobStore(scoped(DesignBlob), tenant);
    cadDocuments = new CadDocumentsService(new DesignBlobStoreAdapter(blobs));
    usage = new PostgresUsageMeter();
    events = new PostgresCadEventPublisher();
    repository = new CadDocumentsRepository(
      scoped(CadProject),
      scoped(CadDocument),
      scoped(CadDocumentVersion),
      scoped(CadPublication),
      tenant,
      cadDocuments,
      undefined,
      events,
      usage,
      source,
    );
  });

  const inOrganization = <T>(fn: () => T): T =>
    tenant.run(context(organizationId), fn);

  it('persists and hydrates >1 MB with blob, CAS, version, usage, event and publication atomically', async () => {
    await inOrganization(async () => {
      const created = await repository.createDocument({ name: 'Plano grande' });
      const document = largeDocument();
      expect(
        Buffer.byteLength(JSON.stringify(document), 'utf8'),
      ).toBeGreaterThan(1_000_000);

      const saved = await repository.saveContent(created.id, {
        document,
        expectedVersion: 0,
      });
      expect(saved).toMatchObject({
        cadDocumentVersion: 1,
        storedAsBlobPointer: true,
      });
      expect(await source.getRepository(DesignBlob).count()).toBe(1);
      expect(await source.getRepository(CadDocumentVersion).count()).toBe(1);
      expect(await source.getRepository(UsageLedger).count()).toBe(1);
      expect(await source.getRepository(DomainOutbox).count()).toBe(1);

      const stored = await repository.getDocument(created.id);
      expect(
        await cadDocuments.hydrateCadDocument(stored.cadDocument!),
      ).toEqual(document);

      const published = await repository.recordPublication(created.id, {
        expectedCadDocumentVersion: 1,
        paperSpaceIds: ['sheet-1'],
        fileName: 'plano.pdf',
        sha256: 'a'.repeat(64),
        bytes: 4096,
      });
      expect(published.cadDocumentVersion).toBe(2);
      expect(await source.getRepository(CadPublication).count()).toBe(1);
      expect(await source.getRepository(CadDocumentVersion).count()).toBe(2);
      expect(await source.getRepository(UsageLedger).count()).toBe(2);
      expect(await source.getRepository(DomainOutbox).count()).toBe(2);
      expect(await source.getRepository(DesignBlob).count()).toBe(2);

      const publicationUsage = await source
        .getRepository(UsageLedger)
        .findOneByOrFail({
          metric: 'design.document.published',
        });
      const publicationEvent = await source
        .getRepository(DomainOutbox)
        .findOneByOrFail({
          type: 'design.document.published',
        });
      expect(publicationUsage.idempotencyKey).toContain(
        ':version:2:publication',
      );
      expect(publicationEvent.idempotencyKey).toBe(
        publicationUsage.idempotencyKey,
      );
    });
  });

  it('rolls back a losing idempotency payload without CAS, version, usage or orphan blob', async () => {
    await inOrganization(async () => {
      const created = await repository.createDocument({
        name: 'Rollback save',
      });
      const key = `cad-document:${created.id}:version:1`;
      await source.transaction((native) =>
        events.publish(
          {
            organizationId,
            tenantId: organizationId,
            type: 'design.document.saved',
            aggregateId: created.id,
            payload: { version: 999, entityCount: 999 },
            idempotencyKey: key,
          },
          { native },
        ),
      );

      await expect(
        repository.saveContent(created.id, {
          document: largeDocument(),
          expectedVersion: 0,
        }),
      ).rejects.toBeInstanceOf(IdempotencyConflictError);

      const unchanged = await repository.getDocument(created.id);
      expect(unchanged.cadDocumentVersion).toBe(0);
      expect(unchanged.cadDocument).toBeNull();
      expect(await source.getRepository(CadDocumentVersion).count()).toBe(0);
      expect(await source.getRepository(UsageLedger).count()).toBe(0);
      expect(await source.getRepository(DesignBlob).count()).toBe(0);
      expect(await source.getRepository(DomainOutbox).count()).toBe(1);
    });
  });

  it('rolls back publication, version, usage and its new blob on event conflict', async () => {
    await inOrganization(async () => {
      const created = await repository.createDocument({
        name: 'Rollback publication',
      });
      await repository.saveContent(created.id, {
        document: largeDocument(),
        expectedVersion: 0,
      });
      const key = `cad-document:${created.id}:version:2:publication`;
      await source.transaction((native) =>
        events.publish(
          {
            organizationId,
            tenantId: organizationId,
            type: 'design.document.published',
            aggregateId: created.id,
            payload: { version: 2, publicationId: 'conflicting-payload' },
            idempotencyKey: key,
          },
          { native },
        ),
      );

      await expect(
        repository.recordPublication(created.id, {
          expectedCadDocumentVersion: 1,
          paperSpaceIds: ['sheet-1'],
          fileName: 'rollback.pdf',
          sha256: 'b'.repeat(64),
          bytes: 512,
        }),
      ).rejects.toBeInstanceOf(IdempotencyConflictError);

      const unchanged = await repository.getDocument(created.id);
      expect(unchanged.cadDocumentVersion).toBe(1);
      expect(await source.getRepository(CadPublication).count()).toBe(0);
      expect(await source.getRepository(CadDocumentVersion).count()).toBe(1);
      expect(await source.getRepository(UsageLedger).count()).toBe(1);
      expect(await source.getRepository(DesignBlob).count()).toBe(1);
      expect(await source.getRepository(DomainOutbox).count()).toBe(2);
    });
  });

  it('deduplicates concurrent content-addressed puts to one tenant blob', async () => {
    await inOrganization(async () => {
      const bytes = Buffer.from('same-concurrent-cad-archive');
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const results = await Promise.all(
        Array.from({ length: 12 }, () => blobs.put(bytes, sha256)),
      );
      expect(new Set(results.map((result) => result.blobKey)).size).toBe(1);
      expect(results.filter((result) => result.created)).toHaveLength(1);
      expect(await source.getRepository(DesignBlob).count()).toBe(1);
    });
  });
});

function context(organizationId: string): TenantContext {
  return {
    tenant_id: organizationId,
    organization_id: organizationId,
    plant_id: null,
    user_email: 'cad-persistence@test.invalid',
    role: 'owner',
    permissions: ['cad:view', 'cad:edit', 'cad:publish'],
    scopes: null,
  };
}

function largeDocument(): Record<string, unknown> {
  return {
    meta: { schema: 3, version: 1, unit: 'mm' },
    entities: [
      {
        id: 'line-1',
        type: 'line',
        start: { x: 0, y: 0 },
        end: { x: 1000, y: 0 },
      },
    ],
    paperSpaces: [{ id: 'sheet-1', page: { width: 297, height: 210 } }],
    recoveryNotes: 'professional-cad-dataset\n'.repeat(50_000),
  };
}
