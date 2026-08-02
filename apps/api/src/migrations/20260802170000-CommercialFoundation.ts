import { MigrationInterface, QueryRunner } from 'typeorm';
export class CommercialFoundation20260802170000 implements MigrationInterface {
  name = 'CommercialFoundation20260802170000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE "plan_catalog" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "code" varchar(80) NOT NULL UNIQUE, "active" boolean NOT NULL DEFAULT true, "metadata" jsonb NULL)`,
    );
    await q.query(
      `CREATE TABLE "plan_entitlements" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "plan_code" varchar(80) NOT NULL REFERENCES "plan_catalog"("code") ON DELETE CASCADE, "entitlement_code" varchar(120) NOT NULL, CONSTRAINT "uq_plan_entitlement" UNIQUE("plan_code","entitlement_code"))`,
    );
    await q.query(
      `CREATE TABLE "subscriptions" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" varchar(36) NOT NULL UNIQUE, "tenant_id" varchar(36) NOT NULL, "plan_code" varchar(80) NOT NULL REFERENCES "plan_catalog"("code"), "status" varchar(24) NOT NULL CHECK ("status" IN ('active','trialing','past_due','canceled','pending')), "trial_ends_at" timestamptz NULL, "created_at" timestamptz NOT NULL DEFAULT now())`,
    );
    await q.query(
      `CREATE TABLE "usage_ledger" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" varchar(36) NOT NULL, "tenant_id" varchar(36) NOT NULL, "metric" varchar(120) NOT NULL, "quantity" integer NOT NULL CHECK ("quantity">0), "idempotency_key" varchar(160) NOT NULL, "recorded_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "uq_usage_org_key" UNIQUE("organization_id","idempotency_key"))`,
    );
    await q.query(
      `CREATE TABLE "domain_outbox" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" varchar(36) NOT NULL, "tenant_id" varchar(36) NOT NULL, "type" varchar(160) NOT NULL, "aggregate_id" varchar(80) NOT NULL, "payload" jsonb NOT NULL, "idempotency_key" varchar(160) NOT NULL, "status" varchar(20) NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','processing','sent')), "attempt_count" integer NOT NULL DEFAULT 0, "available_at" timestamptz NOT NULL DEFAULT now(), "sent_at" timestamptz NULL, "created_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "uq_domain_outbox_org_key" UNIQUE("organization_id","idempotency_key"))`,
    );
    await q.query(
      `CREATE INDEX "idx_domain_outbox_pending" ON "domain_outbox"("available_at","created_at") WHERE "status"='pending'`,
    );
    await q.query(
      `CREATE TABLE "email_outbox" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" varchar(36) NOT NULL, "tenant_id" varchar(36) NOT NULL, "recipient" varchar(320) NOT NULL, "template" varchar(120) NOT NULL, "payload" jsonb NOT NULL, "idempotency_key" varchar(160) NOT NULL, "status" varchar(20) NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','processing','sent')), "attempt_count" integer NOT NULL DEFAULT 0, "available_at" timestamptz NOT NULL DEFAULT now(), "sent_at" timestamptz NULL, "created_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "uq_email_outbox_org_key" UNIQUE("organization_id","idempotency_key"))`,
    );
    await q.query(
      `CREATE INDEX "idx_email_outbox_pending" ON "email_outbox"("available_at","created_at") WHERE "status"='pending'`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    for (const table of [
      'email_outbox',
      'domain_outbox',
      'usage_ledger',
      'subscriptions',
      'plan_entitlements',
      'plan_catalog',
    ])
      await q.query(`DROP TABLE IF EXISTS "${table}"`);
  }
}
