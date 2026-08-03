import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommercialFoundation20260802170000 implements MigrationInterface {
  name = 'CommercialFoundation20260802170000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "plan_catalog" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar(80) NOT NULL UNIQUE,
        "active" boolean NOT NULL DEFAULT true,
        "metadata" jsonb NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "plan_entitlements" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "plan_code" varchar(80) NOT NULL
          REFERENCES "plan_catalog"("code") ON DELETE CASCADE,
        "entitlement_code" varchar(120) NOT NULL,
        CONSTRAINT "uq_plan_entitlement" UNIQUE("plan_code", "entitlement_code")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "subscriptions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL UNIQUE
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        "tenant_id" uuid NOT NULL
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        "plan_code" varchar(80) NOT NULL
          REFERENCES "plan_catalog"("code") ON DELETE RESTRICT,
        "status" varchar(24) NOT NULL
          CHECK ("status" IN ('trialing', 'active', 'past_due', 'suspended', 'cancelled')),
        "trial_ends_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_subscriptions_tenant_scope"
          CHECK ("tenant_id" = "organization_id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "usage_ledger" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        "tenant_id" uuid NOT NULL
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        "metric" varchar(120) NOT NULL,
        "quantity" integer NOT NULL CHECK ("quantity" > 0),
        "idempotency_key" varchar(160) NOT NULL,
        "payload_hash" varchar(64) NOT NULL,
        "recorded_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_usage_ledger_tenant_scope"
          CHECK ("tenant_id" = "organization_id"),
        CONSTRAINT "uq_usage_org_key" UNIQUE("organization_id", "idempotency_key")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "domain_outbox" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        "tenant_id" uuid NOT NULL
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        "type" varchar(160) NOT NULL,
        "aggregate_id" varchar(80) NOT NULL,
        "payload" jsonb NOT NULL,
        "idempotency_key" varchar(160) NOT NULL,
        "payload_hash" varchar(64) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending'
          CHECK ("status" IN ('pending', 'processing', 'sent', 'failed', 'dead')),
        "attempt_count" integer NOT NULL DEFAULT 0,
        "available_at" timestamptz NOT NULL DEFAULT now(),
        "locked_at" timestamptz NULL,
        "lock_owner" varchar(120) NULL,
        "last_error" text NULL,
        "sent_at" timestamptz NULL,
        "failed_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_domain_outbox_tenant_scope"
          CHECK ("tenant_id" = "organization_id"),
        CONSTRAINT "uq_domain_outbox_org_key" UNIQUE("organization_id", "idempotency_key")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_domain_outbox_dispatch"
      ON "domain_outbox"("available_at", "created_at")
      WHERE "status" IN ('pending', 'failed', 'processing')
    `);
    await queryRunner.query(`
      CREATE TABLE "email_outbox" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NULL
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        "tenant_id" uuid NULL
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        "recipient" varchar(320) NOT NULL,
        "template" varchar(120) NOT NULL,
        "payload" jsonb NOT NULL,
        "idempotency_key" varchar(160) NOT NULL UNIQUE,
        "payload_hash" varchar(64) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending'
          CHECK ("status" IN ('pending', 'processing', 'sent', 'failed', 'dead')),
        "attempt_count" integer NOT NULL DEFAULT 0,
        "available_at" timestamptz NOT NULL DEFAULT now(),
        "locked_at" timestamptz NULL,
        "lock_owner" varchar(120) NULL,
        "last_error" text NULL,
        "sent_at" timestamptz NULL,
        "failed_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_email_outbox_tenant_scope" CHECK (
          ("organization_id" IS NULL AND "tenant_id" IS NULL)
          OR (
            "organization_id" IS NOT NULL
            AND "tenant_id" IS NOT NULL
            AND "tenant_id" = "organization_id"
          )
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_email_outbox_dispatch"
      ON "email_outbox"("available_at", "created_at")
      WHERE "status" IN ('pending', 'failed', 'processing')
    `);
    await queryRunner.query(`
      INSERT INTO "plan_catalog" ("code", "active", "metadata")
      VALUES ('standalone-trial', true, '{"kind":"trial","pricePublished":false}'::jsonb)
    `);
    await queryRunner.query(`
      INSERT INTO "plan_entitlements" ("plan_code", "entitlement_code")
      VALUES ('standalone-trial', 'design.cad')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "email_outbox"`);
    await queryRunner.query(`DROP TABLE "domain_outbox"`);
    await queryRunner.query(`DROP TABLE "usage_ledger"`);
    await queryRunner.query(`DROP TABLE "subscriptions"`);
    await queryRunner.query(`DROP TABLE "plan_entitlements"`);
    await queryRunner.query(`DROP TABLE "plan_catalog"`);
  }
}
