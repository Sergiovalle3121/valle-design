import type { QueryRunner } from 'typeorm';
import { TeamMessaging20260831090000 } from './20260831090000-TeamMessaging';

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

describe('TeamMessaging migration', () => {
  it('creates the three messaging_* tables with tenant NOT NULL from birth', async () => {
    const sql: string[] = [];
    const migration = new TeamMessaging20260831090000();

    await migration.up(runnerCapturing(sql));

    const joined = sql.join('\n');
    expect(migration.name).toContain('20260831090000');
    for (const table of [
      'messaging_channels',
      'messaging_channel_members',
      'messaging_messages',
    ]) {
      expect(joined).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
    }
    // A diferencia de las tablas cad_* de 2026-08-01, nacen tenant NOT NULL:
    // no hay filas legadas que adoptar.
    expect(joined.match(/"tenant_id" varchar\(36\) NOT NULL/g)).toHaveLength(
      3,
    );
    expect(joined).not.toContain('"tenant_id" varchar(36) NULL');
    // FKs: canal -> proyecto CAD, miembro -> canal, mensaje -> canal y padre.
    expect(joined).toContain('"fk_messaging_channel_project"');
    expect(joined).toContain('REFERENCES "cad_projects" ("id")');
    expect(joined).toContain('"fk_messaging_channel_member_channel"');
    expect(joined).toContain('"fk_messaging_message_channel"');
    expect(joined).toContain('"fk_messaging_message_parent"');
    expect(joined).toContain(
      'REFERENCES "messaging_messages" ("id")\n          ON DELETE SET NULL',
    );
    // Único: la clave del canal directo por tenant, y (canal, usuario).
    expect(joined).toContain('"uq_messaging_channel_direct_key"');
    expect(joined).toContain('WHERE "direct_key" IS NOT NULL');
    expect(joined).toContain('"uq_messaging_channel_member"');
    expect(joined).toContain('("channel_id", "user_id")');
  });

  it('enables RLS with the tenant policy on all three tables', async () => {
    const sql: string[] = [];
    await new TeamMessaging20260831090000().up(runnerCapturing(sql));
    const joined = sql.join('\n');

    for (const table of [
      'messaging_channels',
      'messaging_channel_members',
      'messaging_messages',
    ]) {
      expect(joined).toContain(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
      expect(joined).toContain(`CREATE POLICY "p_${table}_tenant"`);
      expect(joined).toContain(
        `USING ("tenant_id" = current_setting('app.tenant_id', true))`,
      );
    }
  });

  it('keeps the same migration executable on SQLite without native UUIDs', async () => {
    const sql: string[] = [];
    await new TeamMessaging20260831090000().up(
      runnerCapturing(sql, 'better-sqlite3'),
    );
    const joined = sql.join('\n');
    expect(
      joined.match(/"id" varchar\(36\) PRIMARY KEY NOT NULL/g),
    ).toHaveLength(3);
    expect(joined).not.toContain('gen_random_uuid()');
  });

  it('down drops policies and the three tables in dependency order', async () => {
    const sql: string[] = [];
    await new TeamMessaging20260831090000().down(runnerCapturing(sql));

    expect(sql).toEqual([
      'DROP POLICY IF EXISTS "p_messaging_messages_tenant" ON "messaging_messages"',
      'DROP POLICY IF EXISTS "p_messaging_channel_members_tenant" ON "messaging_channel_members"',
      'DROP POLICY IF EXISTS "p_messaging_channels_tenant" ON "messaging_channels"',
      'DROP TABLE IF EXISTS "messaging_messages"',
      'DROP TABLE IF EXISTS "messaging_channel_members"',
      'DROP TABLE IF EXISTS "messaging_channels"',
    ]);
  });
});
