import { MigrationInterface, QueryRunner } from 'typeorm';

export class FirstPartyIdentity20260802160000 implements MigrationInterface {
  name = 'FirstPartyIdentity20260802160000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS identity_users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar NOT NULL UNIQUE, "displayName" varchar, "emailVerifiedAt" timestamptz, "createdAt" timestamptz NOT NULL DEFAULT now())`);
    await q.query(`CREATE TABLE IF NOT EXISTS identity_credentials (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL UNIQUE REFERENCES identity_users(id) ON DELETE CASCADE, "passwordHash" varchar NOT NULL, algorithm varchar NOT NULL DEFAULT 'argon2id', "createdAt" timestamptz NOT NULL DEFAULT now())`);
    await q.query(`CREATE TABLE IF NOT EXISTS identity_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE, "secretHash" varchar NOT NULL, "csrfHash" varchar NOT NULL, "expiresAt" timestamptz NOT NULL, "revokedAt" timestamptz, "lastSeenAt" timestamptz, "ipAddress" varchar, "userAgent" varchar, "createdAt" timestamptz NOT NULL DEFAULT now())`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_identity_sessions_user ON identity_sessions("userId")`);
    await q.query(`CREATE TABLE IF NOT EXISTS identity_one_time_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "subjectId" uuid NOT NULL, purpose varchar NOT NULL, "tokenHash" varchar NOT NULL UNIQUE, "expiresAt" timestamptz NOT NULL, "consumedAt" timestamptz, "createdAt" timestamptz NOT NULL DEFAULT now())`);
    await q.query(`CREATE TABLE IF NOT EXISTS organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar NOT NULL, slug varchar NOT NULL UNIQUE, "ownerUserId" uuid NOT NULL REFERENCES identity_users(id), "createdAt" timestamptz NOT NULL DEFAULT now())`);
    await q.query(`CREATE TABLE IF NOT EXISTS organization_memberships (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organizationId" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, "userId" uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE, role varchar NOT NULL DEFAULT 'member', "createdAt" timestamptz NOT NULL DEFAULT now(), UNIQUE("organizationId", "userId"))`);
    await q.query(`CREATE TABLE IF NOT EXISTS organization_invitations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organizationId" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, email varchar NOT NULL, role varchar NOT NULL, "tokenHash" varchar NOT NULL UNIQUE, "expiresAt" timestamptz NOT NULL, "consumedAt" timestamptz, "invitedByUserId" uuid NOT NULL REFERENCES identity_users(id), "createdAt" timestamptz NOT NULL DEFAULT now())`);
    await q.query(`CREATE TABLE IF NOT EXISTS subscription_plans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code varchar NOT NULL UNIQUE, name varchar NOT NULL, entitlements jsonb NOT NULL DEFAULT '{}', active boolean NOT NULL DEFAULT true)`);
    await q.query(`CREATE TABLE IF NOT EXISTS subscription_trials (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organizationId" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, "planId" uuid NOT NULL REFERENCES subscription_plans(id), "startsAt" timestamptz NOT NULL, "endsAt" timestamptz NOT NULL, "cancelledAt" timestamptz, "createdAt" timestamptz NOT NULL DEFAULT now())`);
    await q.query(`CREATE TABLE IF NOT EXISTS identity_audit_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "actorUserId" uuid, "organizationId" uuid, action varchar NOT NULL, metadata jsonb, "createdAt" timestamptz NOT NULL DEFAULT now())`);
  }
  async down(): Promise<void> { /* additive security migration: intentionally irreversible */ }
}
