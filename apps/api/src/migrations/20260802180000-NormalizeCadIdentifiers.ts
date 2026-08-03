import { MigrationInterface, QueryRunner } from 'typeorm';

const UUID_PATTERN =
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

const CAD_TABLES = [
  { table: 'cad_projects', legacyColumn: 'legacy_source_id' },
  { table: 'cad_documents', legacyColumn: 'legacy_source_id' },
  { table: 'cad_document_versions', legacyColumn: 'legacy_source_id' },
  { table: 'cad_publications', legacyColumn: 'legacy_source_id' },
  { table: 'cad_review_sessions', legacyColumn: 'legacy_source_id' },
  { table: 'cad_comments', legacyColumn: 'legacy_source_id' },
] as const;

const CAD_FOREIGN_KEYS = [
  {
    table: 'cad_documents',
    column: 'project_id',
    target: 'cad_projects',
    constraint: 'fk_cad_document_project',
    nullableAction: 'SET NULL',
  },
  {
    table: 'cad_document_versions',
    column: 'document_id',
    target: 'cad_documents',
    constraint: 'fk_cad_document_version_document',
    nullableAction: 'CASCADE',
  },
  {
    table: 'cad_publications',
    column: 'document_id',
    target: 'cad_documents',
    constraint: 'fk_cad_publication_document',
    nullableAction: 'CASCADE',
  },
  {
    table: 'cad_review_sessions',
    column: 'document_id',
    target: 'cad_documents',
    constraint: 'fk_cad_review_session_document',
    nullableAction: 'CASCADE',
  },
  {
    table: 'cad_comments',
    column: 'review_session_id',
    target: 'cad_review_sessions',
    constraint: 'fk_cad_comment_review_session',
    nullableAction: 'SET NULL',
  },
  {
    table: 'cad_comments',
    column: 'document_id',
    target: 'cad_documents',
    constraint: 'fk_cad_comment_document',
    nullableAction: 'CASCADE',
  },
] as const;

/**
 * Reconciles the historical varchar(36) CAD identifiers with the UUID model
 * declared by `PrimaryGeneratedColumn('uuid')`.
 *
 * Old installations may contain non-UUID identifiers. They are never cast or
 * discarded blindly: each one is mapped to a deterministic RFC-4122-shaped
 * UUID and recorded in `cad_uuid_legacy_id_map`. The mapping is created before
 * any column changes, has collision-protecting unique constraints, and all
 * dependent foreign keys use the parent's mapping. A collision or orphan makes
 * the migration transaction fail closed with every original row untouched.
 *
 * `tenant_id`, `organization_id` and `plant_id` deliberately remain varchar:
 * they still bridge legacy tenancy and are not owned by these CAD tables.
 */
export class NormalizeCadIdentifiers20260802180000 implements MigrationInterface {
  name = 'NormalizeCadIdentifiers20260802180000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;

    await this.ensureLegacyEvidenceColumns(queryRunner);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cad_uuid_legacy_id_map" (
        "table_name" varchar(64) NOT NULL,
        "legacy_id" varchar(36) NOT NULL,
        "uuid_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pk_cad_uuid_legacy_id_map"
          PRIMARY KEY ("table_name", "legacy_id"),
        CONSTRAINT "uq_cad_uuid_legacy_id_map_uuid"
          UNIQUE ("table_name", "uuid_id"),
        CONSTRAINT "chk_cad_uuid_legacy_id_map_table"
          CHECK ("table_name" IN (
            'cad_projects',
            'cad_documents',
            'cad_document_versions',
            'cad_publications',
            'cad_review_sessions',
            'cad_comments'
          ))
      )
    `);

    for (const { table, legacyColumn } of CAD_TABLES) {
      const uuidExpression = deterministicUuidExpression(table, '"id"::text');
      await queryRunner.query(`
        INSERT INTO "cad_uuid_legacy_id_map"
          ("table_name", "legacy_id", "uuid_id")
        SELECT '${table}', "id"::text, ${uuidExpression}
          FROM "${table}"
         WHERE "id"::text !~* '${UUID_PATTERN}'
        ON CONFLICT ("table_name", "legacy_id") DO UPDATE
          SET "uuid_id" = EXCLUDED."uuid_id"
      `);

      // Keep the exact incoming id alongside the row wherever the product has
      // a legacy evidence column. Existing import provenance wins; the mapping
      // table still retains the prior primary id in that case.
      await queryRunner.query(`
        UPDATE "${table}"
           SET "${legacyColumn}" = "id"::text
         WHERE "id"::text !~* '${UUID_PATTERN}'
           AND "${legacyColumn}" IS NULL
      `);

      // A deterministic hash collision with an already-valid UUID must abort
      // before constraints are removed or any identifier is changed.
      await queryRunner.query(`
        DO $collision$
        BEGIN
          IF EXISTS (
            SELECT 1
              FROM "cad_uuid_legacy_id_map" AS map
              JOIN "${table}" AS native
                ON native."id"::text ~* '${UUID_PATTERN}'
               AND native."id"::uuid = map."uuid_id"
             WHERE map."table_name" = '${table}'
          ) THEN
            RAISE EXCEPTION
              'CAD UUID normalization collision in ${table}; no identifiers were changed'
              USING ERRCODE = '23505';
          END IF;
        END
        $collision$
      `);
    }

    await this.dropCadForeignKeys(queryRunner);
    for (const { table } of CAD_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "id" DROP DEFAULT`,
      );
    }

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION pg_temp.valle_normalize_cad_id(
        source_table text,
        source_id text
      ) RETURNS uuid
      LANGUAGE plpgsql STABLE AS $function$
      DECLARE normalized uuid;
      BEGIN
        SELECT map."uuid_id" INTO normalized
          FROM "cad_uuid_legacy_id_map" AS map
         WHERE map."table_name" = source_table
           AND map."legacy_id" = source_id;
        IF FOUND THEN
          RETURN normalized;
        END IF;
        RETURN source_id::uuid;
      END
      $function$
    `);

    for (const foreignKey of CAD_FOREIGN_KEYS) {
      await queryRunner.query(`
        ALTER TABLE "${foreignKey.table}"
          ALTER COLUMN "${foreignKey.column}" TYPE uuid
          USING CASE
            WHEN "${foreignKey.column}" IS NULL THEN NULL
            ELSE pg_temp.valle_normalize_cad_id(
              '${foreignKey.target}', "${foreignKey.column}"::text
            )
          END
      `);
    }
    for (const { table } of CAD_TABLES) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ALTER COLUMN "id" TYPE uuid
          USING pg_temp.valle_normalize_cad_id('${table}', "id"::text)
      `);
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ALTER COLUMN "id" SET DEFAULT gen_random_uuid()
      `);
    }

    await this.createCadForeignKeys(queryRunner);
  }

  /**
   * The reverse path restores every mapped legacy id and all references before
   * returning the columns to varchar. Evidence columns are intentionally kept:
   * dropping provenance during a rollback would be a destructive operation.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;

    await this.dropCadForeignKeys(queryRunner);
    for (const { table } of CAD_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "id" DROP DEFAULT`,
      );
    }

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION pg_temp.valle_restore_cad_id(
        source_table text,
        source_id uuid
      ) RETURNS varchar
      LANGUAGE plpgsql STABLE AS $function$
      DECLARE original varchar;
      BEGIN
        SELECT map."legacy_id" INTO original
          FROM "cad_uuid_legacy_id_map" AS map
         WHERE map."table_name" = source_table
           AND map."uuid_id" = source_id;
        IF FOUND THEN
          RETURN original;
        END IF;
        RETURN source_id::text;
      END
      $function$
    `);

    for (const foreignKey of CAD_FOREIGN_KEYS) {
      await queryRunner.query(`
        ALTER TABLE "${foreignKey.table}"
          ALTER COLUMN "${foreignKey.column}" TYPE varchar(36)
          USING CASE
            WHEN "${foreignKey.column}" IS NULL THEN NULL
            ELSE pg_temp.valle_restore_cad_id(
              '${foreignKey.target}', "${foreignKey.column}"::uuid
            )
          END
      `);
    }
    for (const { table } of CAD_TABLES) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ALTER COLUMN "id" TYPE varchar(36)
          USING pg_temp.valle_restore_cad_id('${table}', "id"::uuid)
      `);
    }

    await this.createCadForeignKeys(queryRunner);
    await queryRunner.query(`DROP TABLE "cad_uuid_legacy_id_map"`);
  }

  private async ensureLegacyEvidenceColumns(
    queryRunner: QueryRunner,
  ): Promise<void> {
    for (const table of ['cad_review_sessions', 'cad_comments']) {
      if (!(await queryRunner.hasColumn(table, 'legacy_source_id'))) {
        await queryRunner.query(
          `ALTER TABLE "${table}" ADD COLUMN "legacy_source_id" varchar(64) NULL`,
        );
      }
    }
  }

  private async dropCadForeignKeys(queryRunner: QueryRunner): Promise<void> {
    for (const foreignKey of CAD_FOREIGN_KEYS) {
      await queryRunner.query(
        `ALTER TABLE "${foreignKey.table}" DROP CONSTRAINT IF EXISTS "${foreignKey.constraint}"`,
      );
    }
  }

  private async createCadForeignKeys(queryRunner: QueryRunner): Promise<void> {
    for (const foreignKey of CAD_FOREIGN_KEYS) {
      await queryRunner.query(`
        ALTER TABLE "${foreignKey.table}"
          ADD CONSTRAINT "${foreignKey.constraint}"
          FOREIGN KEY ("${foreignKey.column}")
          REFERENCES "${foreignKey.target}" ("id")
          ON DELETE ${foreignKey.nullableAction}
      `);
    }
  }
}

function deterministicUuidExpression(table: string, value: string): string {
  const digest = `md5('valle-design/cad-uuid/v1/${table}/' || ${value})`;
  return `(
    substr(${digest}, 1, 8) || '-' ||
    substr(${digest}, 9, 4) || '-5' ||
    substr(${digest}, 14, 3) || '-a' ||
    substr(${digest}, 18, 3) || '-' ||
    substr(${digest}, 21, 12)
  )::uuid`;
}
