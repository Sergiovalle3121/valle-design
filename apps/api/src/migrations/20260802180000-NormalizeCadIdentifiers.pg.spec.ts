import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  describePostgres,
  postgresTestUrl,
} from '../common/testing/postgres-harness';
import { NormalizeCadIdentifiers20260802180000 } from './20260802180000-NormalizeCadIdentifiers';

describePostgres('NormalizeCadIdentifiers migration', () => {
  jest.setTimeout(120_000);

  const url = postgresTestUrl()!;
  const active: Array<{ dataSource: DataSource; schema: string }> = [];

  afterEach(async () => {
    for (const harness of active.splice(0)) {
      if (harness.dataSource.isInitialized) {
        await harness.dataSource.destroy();
      }
      const cleanup = new DataSource({ type: 'postgres', url });
      await cleanup.initialize();
      await cleanup.query(`DROP SCHEMA IF EXISTS "${harness.schema}" CASCADE`);
      await cleanup.destroy();
    }
  });

  async function previousMain(): Promise<{
    dataSource: DataSource;
    schema: string;
  }> {
    const schema = `cad_uuid_upgrade_${randomBytes(6).toString('hex')}`;
    const bootstrap = new DataSource({ type: 'postgres', url });
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);
    await bootstrap.destroy();

    const dataSource = new DataSource({
      type: 'postgres',
      url,
      schema,
      migrations: [NormalizeCadIdentifiers20260802180000],
      migrationsTableName: 'typeorm_migrations',
      migrationsTransactionMode: 'each',
      synchronize: false,
      logging: false,
      extra: { options: `-c search_path=${schema}` },
    });
    await dataSource.initialize();
    active.push({ dataSource, schema });
    await createPreviousMainCadTables(dataSource);
    return { dataSource, schema };
  }

  it('upgrades non-UUID data without loss and restores exact ids on down/up', async () => {
    const { dataSource, schema } = await previousMain();
    const nativeProjectId = randomUUID();

    await dataSource.query(
      `INSERT INTO "cad_projects" ("id", "tenant_id", "legacy_source_id")
       VALUES ('project-old', 'tenant-legacy', NULL), ($1, 'tenant-native', NULL)`,
      [nativeProjectId],
    );
    await dataSource.query(
      `INSERT INTO "cad_documents" ("id", "project_id", "legacy_source_id")
       VALUES ('document-old', 'project-old', 'import-layout-77')`,
    );
    await dataSource.query(
      `INSERT INTO "cad_document_versions" ("id", "document_id", "legacy_source_id")
       VALUES ('version-old', 'document-old', NULL)`,
    );
    await dataSource.query(
      `INSERT INTO "cad_publications" ("id", "document_id", "legacy_source_id")
       VALUES ('publication-old', 'document-old', NULL)`,
    );
    await dataSource.query(
      `INSERT INTO "cad_review_sessions" ("id", "document_id")
       VALUES ('review-old', 'document-old')`,
    );
    await dataSource.query(
      `INSERT INTO "cad_comments" ("id", "review_session_id", "document_id")
       VALUES ('comment-old', 'review-old', 'document-old')`,
    );

    expect(await dataSource.runMigrations()).toHaveLength(1);

    const expected = {
      project: mappedUuid('cad_projects', 'project-old'),
      document: mappedUuid('cad_documents', 'document-old'),
      version: mappedUuid('cad_document_versions', 'version-old'),
      publication: mappedUuid('cad_publications', 'publication-old'),
      review: mappedUuid('cad_review_sessions', 'review-old'),
      comment: mappedUuid('cad_comments', 'comment-old'),
    };
    expect(
      await dataSource.query(
        `SELECT c."id"::text AS comment_id,
                r."id"::text AS review_id,
                d."id"::text AS document_id,
                p."id"::text AS project_id,
                v."id"::text AS version_id,
                pub."id"::text AS publication_id
           FROM "cad_comments" c
           JOIN "cad_review_sessions" r ON r."id" = c."review_session_id"
           JOIN "cad_documents" d ON d."id" = c."document_id"
           JOIN "cad_projects" p ON p."id" = d."project_id"
           JOIN "cad_document_versions" v ON v."document_id" = d."id"
           JOIN "cad_publications" pub ON pub."document_id" = d."id"`,
      ),
    ).toEqual([
      {
        comment_id: expected.comment,
        review_id: expected.review,
        document_id: expected.document,
        project_id: expected.project,
        version_id: expected.version,
        publication_id: expected.publication,
      },
    ]);
    expect(
      await dataSource.query(
        `SELECT "table_name", "legacy_id", "uuid_id"::text AS uuid_id
           FROM "cad_uuid_legacy_id_map"
          ORDER BY "table_name"`,
      ),
    ).toHaveLength(6);
    expect(
      await dataSource.query(
        `SELECT "legacy_source_id" FROM "cad_documents"
          WHERE "id" = $1`,
        [expected.document],
      ),
    ).toEqual([{ legacy_source_id: 'import-layout-77' }]);
    expect(
      await dataSource.query(
        `SELECT "legacy_source_id" FROM "cad_review_sessions"
          WHERE "id" = $1`,
        [expected.review],
      ),
    ).toEqual([{ legacy_source_id: 'review-old' }]);

    const columnTypes = await dataSource.query(
      `SELECT table_name, column_name, data_type, column_default
         FROM information_schema.columns
        WHERE table_schema = $1
          AND (
            (column_name = 'id' AND table_name LIKE 'cad_%')
            OR (table_name = 'cad_documents'
                AND column_name IN ('project_id', 'tenant_id'))
          )
        ORDER BY table_name, column_name`,
      [schema],
    );
    expect(
      columnTypes.filter(
        (column: { column_name: string }) => column.column_name === 'id',
      ),
    ).toHaveLength(6);
    expect(
      columnTypes
        .filter(
          (column: { column_name: string }) => column.column_name === 'id',
        )
        .every(
          (column: { data_type: string; column_default: string }) =>
            column.data_type === 'uuid' &&
            column.column_default.includes('gen_random_uuid'),
        ),
    ).toBe(true);
    expect(
      columnTypes.find(
        (column: { column_name: string }) =>
          column.column_name === 'project_id',
      )?.data_type,
    ).toBe('uuid');
    expect(
      columnTypes.find(
        (column: { column_name: string }) => column.column_name === 'tenant_id',
      )?.data_type,
    ).toBe('character varying');

    const generated = await dataSource.query(
      `INSERT INTO "cad_projects" ("tenant_id") VALUES ('tenant-new')
       RETURNING "id"::text AS id`,
    );
    expect(generated[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    await expect(
      dataSource.query(
        `INSERT INTO "cad_documents" ("project_id") VALUES ($1)`,
        [randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23503' });

    await dataSource.undoLastMigration({ transaction: 'each' });
    expect(
      await dataSource.query(
        `SELECT c."id" AS comment_id,
                c."review_session_id" AS review_id,
                c."document_id" AS document_id,
                d."project_id" AS project_id
           FROM "cad_comments" c
           JOIN "cad_documents" d ON d."id" = c."document_id"`,
      ),
    ).toEqual([
      {
        comment_id: 'comment-old',
        review_id: 'review-old',
        document_id: 'document-old',
        project_id: 'project-old',
      },
    ]);
    expect(
      await dataSource.query(`SELECT to_regclass('cad_uuid_legacy_id_map')`),
    ).toEqual([{ to_regclass: null }]);

    expect(await dataSource.runMigrations()).toHaveLength(1);
    expect(
      await dataSource.query(
        `SELECT "id"::text AS id FROM "cad_documents"
          WHERE "legacy_source_id" = 'import-layout-77'`,
      ),
    ).toEqual([{ id: expected.document }]);
  });

  it('fails closed on a deterministic mapping collision', async () => {
    const { dataSource, schema } = await previousMain();
    const legacyId = 'legacy-collision';
    const collidingNativeId = mappedUuid('cad_projects', legacyId);
    await dataSource.query(
      `INSERT INTO "cad_projects" ("id") VALUES ($1), ($2)`,
      [legacyId, collidingNativeId],
    );

    await expect(dataSource.runMigrations()).rejects.toMatchObject({
      code: '23505',
    });
    expect(
      await dataSource.query(
        `SELECT "id", "legacy_source_id" FROM "cad_projects" ORDER BY "id"`,
      ),
    ).toEqual([
      { id: collidingNativeId, legacy_source_id: null },
      { id: legacyId, legacy_source_id: null },
    ]);
    expect(
      await dataSource.query(
        `SELECT data_type FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = 'cad_projects'
            AND column_name = 'id'`,
        [schema],
      ),
    ).toEqual([{ data_type: 'character varying' }]);
    expect(
      await dataSource.query(`SELECT to_regclass('cad_uuid_legacy_id_map')`),
    ).toEqual([{ to_regclass: null }]);
  });
});

async function createPreviousMainCadTables(dataSource: DataSource) {
  await dataSource.query(`
    CREATE TABLE "cad_projects" (
      "id" varchar(36) PRIMARY KEY NOT NULL,
      "tenant_id" varchar(36) NULL,
      "legacy_source_id" varchar(64) NULL
    )
  `);
  await dataSource.query(`
    CREATE TABLE "cad_documents" (
      "id" varchar(36) PRIMARY KEY NOT NULL,
      "tenant_id" varchar(36) NULL,
      "project_id" varchar(36) NULL,
      "legacy_source_id" varchar(36) NULL,
      CONSTRAINT "fk_cad_document_project"
        FOREIGN KEY ("project_id") REFERENCES "cad_projects" ("id")
        ON DELETE SET NULL
    )
  `);
  await dataSource.query(`
    CREATE TABLE "cad_document_versions" (
      "id" varchar(36) PRIMARY KEY NOT NULL,
      "document_id" varchar(36) NOT NULL,
      "legacy_source_id" varchar(96) NULL,
      CONSTRAINT "fk_cad_document_version_document"
        FOREIGN KEY ("document_id") REFERENCES "cad_documents" ("id")
        ON DELETE CASCADE
    )
  `);
  await dataSource.query(`
    CREATE TABLE "cad_publications" (
      "id" varchar(36) PRIMARY KEY NOT NULL,
      "document_id" varchar(36) NOT NULL,
      "legacy_source_id" varchar(64) NULL,
      CONSTRAINT "fk_cad_publication_document"
        FOREIGN KEY ("document_id") REFERENCES "cad_documents" ("id")
        ON DELETE CASCADE
    )
  `);
  await dataSource.query(`
    CREATE TABLE "cad_review_sessions" (
      "id" varchar(36) PRIMARY KEY NOT NULL,
      "document_id" varchar(36) NOT NULL,
      CONSTRAINT "fk_cad_review_session_document"
        FOREIGN KEY ("document_id") REFERENCES "cad_documents" ("id")
        ON DELETE CASCADE
    )
  `);
  await dataSource.query(`
    CREATE TABLE "cad_comments" (
      "id" varchar(36) PRIMARY KEY NOT NULL,
      "review_session_id" varchar(36) NULL,
      "document_id" varchar(36) NOT NULL,
      CONSTRAINT "fk_cad_comment_review_session"
        FOREIGN KEY ("review_session_id") REFERENCES "cad_review_sessions" ("id")
        ON DELETE SET NULL,
      CONSTRAINT "fk_cad_comment_document"
        FOREIGN KEY ("document_id") REFERENCES "cad_documents" ("id")
        ON DELETE CASCADE
    )
  `);
}

function mappedUuid(table: string, legacyId: string): string {
  const digest = createHash('md5')
    .update(`valle-design/cad-uuid/v1/${table}/${legacyId}`)
    .digest('hex');
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    `a${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join('-');
}
