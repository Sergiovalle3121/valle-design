import type { QueryRunner } from 'typeorm';
import { CreateCadDocumentsFoundation20260801090000 } from './20260801090000-CreateCadDocumentsFoundation';

function runnerCapturing(
  sql: string[],
  type: 'postgres' | 'better-sqlite3' = 'postgres',
): QueryRunner {
  return {
    connection: { options: { type } },
    query: async (statement: string) => {
      sql.push(statement);
    },
    hasTable: async () => true,
  } as unknown as QueryRunner;
}

describe('CreateCadDocumentsFoundation migration', () => {
  it('creates the six cad_* tables with native UUID keys and textual tenant scope', async () => {
    const sql: string[] = [];
    const migration = new CreateCadDocumentsFoundation20260801090000();

    await migration.up(runnerCapturing(sql));

    const joined = sql.join('\n');
    expect(migration.name).toContain('20260801090000');
    for (const table of [
      'cad_projects',
      'cad_documents',
      'cad_document_versions',
      'cad_publications',
      'cad_review_sessions',
      'cad_comments',
    ]) {
      expect(joined).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
    }
    // Columnas de tenant en todas las tablas (TenantBaseEntity).
    expect(joined.match(/"tenant_id" varchar\(36\) NULL/g)).toHaveLength(6);
    // Los identificadores internos y sus FKs convergen con
    // PrimaryGeneratedColumn('uuid'); el tenant legacy sigue siendo texto.
    expect(
      joined.match(
        /"id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid\(\)/g,
      ),
    ).toHaveLength(6);
    expect(joined).toContain('"project_id" uuid NULL');
    expect(joined.match(/"document_id" uuid NOT NULL/g)).toHaveLength(4);
    expect(joined).toContain('"review_session_id" uuid NULL');
    // legacy_source_id único por tenant cuando no es nulo + lane de sistema.
    expect(joined).toContain('"uq_cad_document_tenant_legacy"');
    expect(joined).toContain('"uq_cad_document_legacy_lane"');
    expect(joined).toContain('"uq_cad_project_tenant_legacy"');
    expect(joined).toContain('WHERE "legacy_source_id" IS NOT NULL');
    // Historial idempotente: (document_id, version) único.
    expect(joined).toContain('"uq_cad_document_version"');
    expect(joined).toContain('("document_id", "version")');
    // FKs SOLO entre tablas cad_* — jamás hacia sf_* ni doc_*.
    expect(joined).toContain('"fk_cad_document_project"');
    expect(joined).toContain('"fk_cad_document_version_document"');
    expect(joined).toContain('"fk_cad_publication_document"');
    expect(joined).toContain('"fk_cad_review_session_document"');
    expect(joined).toContain('"fk_cad_comment_review_session"');
    expect(joined).toContain('"fk_cad_comment_document"');
    expect(joined).not.toMatch(/REFERENCES "sf_/);
    expect(joined).not.toMatch(/REFERENCES "doc_/);
    // Aditiva: no toca la tabla legacy mixta.
    expect(joined).not.toContain('sf_line_layouts');
  });

  it('keeps the same migration executable on SQLite without pretending it has native UUIDs', async () => {
    const sql: string[] = [];
    await new CreateCadDocumentsFoundation20260801090000().up(
      runnerCapturing(sql, 'better-sqlite3'),
    );

    const joined = sql.join('\n');
    expect(
      joined.match(/"id" varchar\(36\) PRIMARY KEY NOT NULL/g),
    ).toHaveLength(6);
    expect(joined).not.toContain('gen_random_uuid()');
    expect(joined).toContain('"project_id" varchar(36) NULL');
  });

  it('down drops ONLY the six new cad_* tables, in dependency order', async () => {
    const sql: string[] = [];
    const migration = new CreateCadDocumentsFoundation20260801090000();

    await migration.down(runnerCapturing(sql));

    expect(sql).toEqual([
      'DROP TABLE IF EXISTS "cad_comments"',
      'DROP TABLE IF EXISTS "cad_review_sessions"',
      'DROP TABLE IF EXISTS "cad_publications"',
      'DROP TABLE IF EXISTS "cad_document_versions"',
      'DROP TABLE IF EXISTS "cad_documents"',
      'DROP TABLE IF EXISTS "cad_projects"',
    ]);
  });
});
