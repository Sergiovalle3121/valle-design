import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
import { CadComment } from '../cad-documents/entities/cad-comment.entity';
import { CadDocument } from '../cad-documents/entities/cad-document.entity';
import { CadReviewSession } from '../cad-documents/entities/cad-review-session.entity';
import {
  CadReviewRepository,
  MAX_COMMENTS_PER_DOCUMENT,
  MAX_OPEN_SESSIONS_PER_DOCUMENT,
} from './cad-review.repository';

const ENTITIES = [CadDocument, CadReviewSession, CadComment];

describePostgres('CAD review capacity is atomic (PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let harness: PostgresHarness;
  let source: DataSource;
  let tenant: TenantContextService;
  let repository: CadReviewRepository;
  let tenantId: string;
  let document: CadDocument;

  beforeAll(async () => {
    harness = await createPostgresHarness(ENTITIES, {
      schemaPrefix: 'cad_review_capacity',
    });
    source = harness.dataSource;
  });

  afterAll(async () => harness.destroy());

  beforeEach(async () => {
    await harness.truncateAll();
    tenantId = randomUUID();
    tenant = new TenantContextService();
    const scoped = <T extends object>(entity: new () => T) =>
      createTenantScopedRepository(entity, source.manager, tenant, {
        strict: true,
      });
    repository = new CadReviewRepository(
      scoped(CadDocument),
      scoped(CadReviewSession),
      scoped(CadComment),
      tenant,
      undefined,
      source,
    );
    document = await source.getRepository(CadDocument).save(
      source.getRepository(CadDocument).create({
        tenant_id: tenantId,
        organization_id: tenantId,
        plant_id: null,
        projectId: null,
        name: 'Concurrent review document',
        model: null,
        revision: null,
        cadDocument: null,
        cadDocumentVersion: 0,
        layers: null,
        legacySourceId: null,
        legacyMetadata: null,
        dxfData: null,
        dxfName: null,
        created_by: 'review-capacity@test.invalid',
      }),
    );
  });

  const context = (): TenantContext => ({
    tenant_id: tenantId,
    organization_id: tenantId,
    plant_id: null,
    user_email: 'review-capacity@test.invalid',
    role: 'owner',
    permissions: ['cad:review'],
    scopes: null,
  });

  it('admits exactly one concurrent open session when nineteen already exist', async () => {
    const sessions = source.getRepository(CadReviewSession);
    await sessions.save(
      Array.from({ length: MAX_OPEN_SESSIONS_PER_DOCUMENT - 1 }, () =>
        sessions.create({
          tenant_id: tenantId,
          organization_id: tenantId,
          plant_id: null,
          documentId: document.id,
          status: 'open',
          closedAt: null,
          tokenHash: null,
          expiresAt: null,
          revokedAt: null,
          allowComments: true,
          created_by: 'seed@test.invalid',
        }),
      ),
    );

    const results = await tenant.run(context(), () =>
      Promise.allSettled(
        Array.from({ length: 12 }, () =>
          repository.createSession(document.id, {}),
        ),
      ),
    );
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(11);
    for (const result of rejected) {
      expect(result.reason).toBeInstanceOf(BadRequestException);
    }
    await expect(
      sessions.countBy({ documentId: document.id, status: 'open' }),
    ).resolves.toBe(MAX_OPEN_SESSIONS_PER_DOCUMENT);
  });

  it('admits exactly one concurrent comment when 499 already exist', async () => {
    const comments = source.getRepository(CadComment);
    const seeded = Array.from(
      { length: MAX_COMMENTS_PER_DOCUMENT - 1 },
      (_, index) =>
        comments.create({
          tenant_id: tenantId,
          organization_id: tenantId,
          plant_id: null,
          documentId: document.id,
          reviewSessionId: null,
          author: 'seed@test.invalid',
          body: `Seed comment ${index}`,
          anchor: null,
          resolved: false,
          created_by: 'seed@test.invalid',
        }),
    );
    await comments.save(seeded, { chunk: 100 });

    const results = await tenant.run(context(), () =>
      Promise.allSettled(
        Array.from({ length: 12 }, (_, index) =>
          repository.createComment(document.id, {
            body: `Concurrent comment ${index}`,
            anchor: { x: index, y: index },
          }),
        ),
      ),
    );
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(11);
    for (const result of rejected) {
      expect(result.reason).toBeInstanceOf(BadRequestException);
    }
    await expect(comments.countBy({ documentId: document.id })).resolves.toBe(
      MAX_COMMENTS_PER_DOCUMENT,
    );
  });
});
