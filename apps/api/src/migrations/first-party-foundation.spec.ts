import type { QueryRunner } from 'typeorm';
import { FirstPartyIdentity20260802160000 } from './20260802160000-FirstPartyIdentity';
import { CommercialFoundation20260802170000 } from './20260802170000-CommercialFoundation';

function recorder() {
  const statements: string[] = [];
  const queryRunner = {
    query: jest.fn(async (sql: string) => {
      statements.push(sql.replace(/\s+/g, ' ').trim());
      return [];
    }),
  } as unknown as QueryRunner;
  return { queryRunner, statements };
}

describe('first-party foundation migrations', () => {
  it('creates one identity/organization model and has a real reverse migration', async () => {
    const up = recorder();
    const migration = new FirstPartyIdentity20260802160000();
    await migration.up(up.queryRunner);
    const ddl = up.statements.join('\n');
    expect(ddl).toContain('ADD COLUMN "activeOrganizationId" uuid NULL');
    expect(ddl).toContain('REFERENCES "organizations"("id")');
    expect(ddl).not.toContain('subscription_plans');
    expect(ddl).not.toContain('subscription_trials');
    expect(ddl).not.toContain('IF NOT EXISTS');

    const down = recorder();
    await migration.down(down.queryRunner);
    expect(down.statements).toHaveLength(9);
    expect(down.statements[0]).toBe('DROP TABLE "identity_rate_limits"');
    expect(down.statements.at(-1)).toBe('DROP TABLE "identity_users"');
  });

  it('uses UUID foreign keys, exact statuses, hashes and recoverable outboxes', async () => {
    const up = recorder();
    const migration = new CommercialFoundation20260802170000();
    await migration.up(up.queryRunner);
    const ddl = up.statements.join('\n');
    expect(ddl).toContain('"organization_id" uuid NOT NULL UNIQUE');
    expect(ddl).toContain(
      "'trialing', 'active', 'past_due', 'suspended', 'cancelled'",
    );
    expect(ddl).toContain('"payload_hash" varchar(64) NOT NULL');
    expect(ddl).toContain('"locked_at" timestamptz NULL');
    expect(ddl).toContain('CONSTRAINT "chk_subscriptions_tenant_scope"');
    expect(ddl).toContain('CONSTRAINT "chk_usage_ledger_tenant_scope"');
    expect(ddl).toContain('CONSTRAINT "chk_domain_outbox_tenant_scope"');
    expect(ddl).toContain('CONSTRAINT "chk_email_outbox_tenant_scope"');
    expect(ddl).toContain("'pending', 'processing', 'sent', 'failed', 'dead'");
    expect(ddl).toContain("VALUES ('standalone-trial', 'design.cad')");
    expect(ddl).not.toContain('varchar(36)');

    const down = recorder();
    await migration.down(down.queryRunner);
    expect(down.statements).toHaveLength(6);
  });
});
