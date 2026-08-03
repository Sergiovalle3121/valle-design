import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, type MigrationInterface } from 'typeorm';
import {
  describePostgres,
  postgresTestUrl,
} from '../common/testing/postgres-harness';
import { AddCadBlocks20260706180000 } from './20260706180000-AddCadBlocks';
import { AddCanonicalCadDocument20260724010000 } from './20260724010000-AddCanonicalCadDocument';
import { ProfessionalCadBlockLibrary20260728110000 } from './20260728110000-ProfessionalCadBlockLibrary';
import { CreateCadDocumentsFoundation20260801090000 } from './20260801090000-CreateCadDocumentsFoundation';
import { CreateDesignBlobs20260801120000 } from './20260801120000-CreateDesignBlobs';
import { DesignFoundation20260801121000 } from './20260801121000-DesignFoundation';
import { MigrationLegacyImport20260802090000 } from './20260802090000-MigrationLegacyImport';
import { ReviewLinkOwnership20260802120000 } from './20260802120000-ReviewLinkOwnership';
import { PurgeReviewLinkTokens20260802140000 } from './20260802140000-PurgeReviewLinkTokens';
import { FirstPartyIdentity20260802160000 } from './20260802160000-FirstPartyIdentity';
import { CommercialFoundation20260802170000 } from './20260802170000-CommercialFoundation';
import { NormalizeCadIdentifiers20260802180000 } from './20260802180000-NormalizeCadIdentifiers';

const LEGACY_MIGRATIONS: Array<new () => MigrationInterface> = [
  AddCadBlocks20260706180000,
  AddCanonicalCadDocument20260724010000,
  ProfessionalCadBlockLibrary20260728110000,
  CreateCadDocumentsFoundation20260801090000,
  CreateDesignBlobs20260801120000,
  DesignFoundation20260801121000,
  MigrationLegacyImport20260802090000,
  ReviewLinkOwnership20260802120000,
  PurgeReviewLinkTokens20260802140000,
];

const ALL_MIGRATIONS: Array<new () => MigrationInterface> = [
  ...LEGACY_MIGRATIONS,
  FirstPartyIdentity20260802160000,
  CommercialFoundation20260802170000,
  NormalizeCadIdentifiers20260802180000,
];

describePostgres('migration chain (previous main -> latest)', () => {
  jest.setTimeout(120_000);

  const url = postgresTestUrl()!;
  const schema = `migration_chain_${randomBytes(6).toString('hex')}`;
  let bootstrap: DataSource;
  let dataSource: DataSource;

  function source(migrations: Array<new () => MigrationInterface>): DataSource {
    return new DataSource({
      type: 'postgres',
      url,
      schema,
      migrations,
      migrationsTableName: 'typeorm_migrations',
      migrationsTransactionMode: 'each',
      synchronize: false,
      logging: false,
      extra: { options: `-c search_path=${schema}` },
    });
  }

  beforeAll(async () => {
    bootstrap = new DataSource({ type: 'postgres', url });
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (bootstrap?.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  });

  it('preserves CAD data, supports new up/down/up and enforces new foreign keys', async () => {
    const projectId = randomUUID();
    const documentId = randomUUID();
    const tenantId = randomUUID();

    dataSource = source(LEGACY_MIGRATIONS);
    await dataSource.initialize();
    expect(await dataSource.runMigrations()).toHaveLength(
      LEGACY_MIGRATIONS.length,
    );

    await dataSource.query(
      `INSERT INTO "cad_projects"
         ("id", "tenant_id", "name", "description", "status", "legacy_source_id")
       VALUES ($1, $2, $3, $4, 'active', $5)`,
      [
        projectId,
        tenantId,
        'Proyecto anterior',
        'Debe sobrevivir',
        'old-project',
      ],
    );
    await dataSource.query(
      `INSERT INTO "cad_documents"
         ("id", "tenant_id", "project_id", "name", "cad_document",
          "cad_document_version", "legacy_source_id")
       VALUES ($1, $2, $3, $4, $5::jsonb, 7, $6)`,
      [
        documentId,
        tenantId,
        projectId,
        'Plano anterior',
        JSON.stringify({
          meta: { schema: 3, version: 1, unit: 'mm' },
          entities: [{ id: 'line-before-upgrade', type: 'line' }],
        }),
        'old-document',
      ],
    );
    await dataSource.destroy();

    dataSource = source(ALL_MIGRATIONS);
    await dataSource.initialize();
    expect(await dataSource.runMigrations()).toHaveLength(3);

    expect(
      await dataSource.query(
        `SELECT "data_type", "column_default"
           FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = 'cad_documents'
            AND column_name = 'id'`,
        [schema],
      ),
    ).toEqual([
      expect.objectContaining({
        data_type: 'uuid',
        column_default: expect.stringContaining('gen_random_uuid'),
      }),
    ]);
    expect(
      await dataSource.query(
        `SELECT "data_type"
           FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = 'cad_documents'
            AND column_name IN ('project_id', 'tenant_id')
          ORDER BY column_name`,
        [schema],
      ),
    ).toEqual([{ data_type: 'uuid' }, { data_type: 'character varying' }]);

    const preserved = await dataSource.query(
      `SELECT "name", "cad_document_version", "cad_document"
         FROM "cad_documents" WHERE "id" = $1`,
      [documentId],
    );
    expect(preserved).toEqual([
      expect.objectContaining({
        name: 'Plano anterior',
        cad_document_version: 7,
        cad_document: expect.objectContaining({
          entities: [{ id: 'line-before-upgrade', type: 'line' }],
        }),
      }),
    ]);

    await dataSource.undoLastMigration({ transaction: 'each' });
    await dataSource.undoLastMigration({ transaction: 'each' });
    await dataSource.undoLastMigration({ transaction: 'each' });
    expect(
      await dataSource.query(
        `SELECT "name" FROM "cad_documents" WHERE "id" = $1`,
        [documentId],
      ),
    ).toEqual([{ name: 'Plano anterior' }]);

    expect(await dataSource.runMigrations()).toHaveLength(3);
    expect(
      await dataSource.query(
        `SELECT "entitlement_code" FROM "plan_entitlements"
          WHERE "plan_code" = 'standalone-trial'`,
      ),
    ).toEqual([{ entitlement_code: 'design.cad' }]);

    await expect(
      dataSource.query(
        `INSERT INTO "identity_one_time_tokens"
           ("subjectId", "purpose", "tokenHash", "expiresAt")
         VALUES ($1, 'verify_email', $2, now() + interval '1 hour')`,
        [randomUUID(), 'a'.repeat(64)],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      dataSource.query(
        `INSERT INTO "subscriptions"
           ("organization_id", "tenant_id", "plan_code", "status")
         VALUES ($1, $1, 'standalone-trial', 'active')`,
        [randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
