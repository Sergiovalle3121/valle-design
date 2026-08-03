import { MigrationInterface, QueryRunner } from 'typeorm';

export class FirstPartyIdentity20260802160000 implements MigrationInterface {
  name = 'FirstPartyIdentity20260802160000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "identity_users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar(254) NOT NULL UNIQUE,
        "displayName" varchar(160) NULL,
        "emailVerifiedAt" timestamptz NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "identity_credentials" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL UNIQUE
          REFERENCES "identity_users"("id") ON DELETE CASCADE,
        "passwordHash" varchar(512) NOT NULL,
        "algorithm" varchar(32) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "identity_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL
          REFERENCES "identity_users"("id") ON DELETE CASCADE,
        "secretHash" varchar(64) NOT NULL,
        "csrfHash" varchar(64) NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "revokedAt" timestamptz NULL,
        "lastSeenAt" timestamptz NULL,
        "ipAddress" varchar(45) NULL,
        "userAgent" varchar(512) NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_identity_sessions_user" ON "identity_sessions"("userId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_identity_sessions_secret_hash" ON "identity_sessions"("secretHash")`,
    );
    await queryRunner.query(`
      CREATE TABLE "identity_one_time_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "subjectId" uuid NOT NULL
          REFERENCES "identity_users"("id") ON DELETE CASCADE,
        "purpose" varchar(32) NOT NULL
          CHECK ("purpose" IN ('verify_email', 'reset_password', 'invitation')),
        "tokenHash" varchar(64) NOT NULL UNIQUE,
        "expiresAt" timestamptz NOT NULL,
        "consumedAt" timestamptz NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_identity_one_time_subject_purpose" ON "identity_one_time_tokens"("subjectId", "purpose")`,
    );
    await queryRunner.query(`
      CREATE TABLE "organizations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(160) NOT NULL,
        "slug" varchar(80) NOT NULL UNIQUE,
        "ownerUserId" uuid NOT NULL
          REFERENCES "identity_users"("id") ON DELETE RESTRICT,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "identity_sessions"
      ADD COLUMN "activeOrganizationId" uuid NULL
        REFERENCES "organizations"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE TABLE "organization_memberships" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organizationId" uuid NOT NULL
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        "userId" uuid NOT NULL
          REFERENCES "identity_users"("id") ON DELETE CASCADE,
        "role" varchar(20) NOT NULL DEFAULT 'member'
          CHECK ("role" IN ('owner', 'admin', 'member', 'viewer')),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_organization_membership" UNIQUE("organizationId", "userId")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_organization_memberships_user" ON "organization_memberships"("userId")`,
    );
    await queryRunner.query(`
      CREATE TABLE "organization_invitations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organizationId" uuid NOT NULL
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        "email" varchar(254) NOT NULL,
        "role" varchar(20) NOT NULL
          CHECK ("role" IN ('admin', 'member', 'viewer')),
        "tokenHash" varchar(64) NOT NULL UNIQUE,
        "expiresAt" timestamptz NOT NULL,
        "consumedAt" timestamptz NULL,
        "invitedByUserId" uuid NOT NULL
          REFERENCES "identity_users"("id") ON DELETE RESTRICT,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_organization_invitations_org_email" ON "organization_invitations"("organizationId", "email")`,
    );
    await queryRunner.query(`
      CREATE TABLE "identity_audit_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "actorUserId" uuid NULL
          REFERENCES "identity_users"("id") ON DELETE SET NULL,
        "organizationId" uuid NULL
          REFERENCES "organizations"("id") ON DELETE SET NULL,
        "action" varchar(120) NOT NULL,
        "metadata" jsonb NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "identity_rate_limits" (
        "key" varchar(256) PRIMARY KEY,
        "count" integer NOT NULL,
        "reset_at" timestamptz NOT NULL,
        "updated_at" timestamptz NOT NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_identity_rate_limits_reset" ON "identity_rate_limits"("reset_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "identity_rate_limits"`);
    await queryRunner.query(`DROP TABLE "identity_audit_events"`);
    await queryRunner.query(`DROP TABLE "organization_invitations"`);
    await queryRunner.query(`DROP TABLE "organization_memberships"`);
    await queryRunner.query(`DROP TABLE "identity_sessions"`);
    await queryRunner.query(`DROP TABLE "organizations"`);
    await queryRunner.query(`DROP TABLE "identity_one_time_tokens"`);
    await queryRunner.query(`DROP TABLE "identity_credentials"`);
    await queryRunner.query(`DROP TABLE "identity_users"`);
  }
}
