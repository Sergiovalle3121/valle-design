import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { JSON_COLUMN_TYPE } from '../../../common/database/json-column-type';
import { DATE_COLUMN_TYPE } from '../../../common/database/date-column-type';
import { Organization } from '../../organizations/entities/organization.entity';

export const SUBSCRIPTION_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'suspended',
  'cancelled',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

@Entity('plan_catalog')
export class PlanCatalog {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index({ unique: true })
  @Column({ name: 'code', type: 'varchar', length: 80 })
  code!: string;
  @Column({ type: 'boolean', default: true }) active!: boolean;
  @Column({ type: JSON_COLUMN_TYPE, nullable: true })
  metadata!: Record<string, unknown> | null;
}

@Entity('plan_entitlements')
@Index(['planCode', 'entitlementCode'], { unique: true })
export class PlanEntitlement {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'plan_code', type: 'varchar', length: 80 })
  planCode!: string;
  @ManyToOne(() => PlanCatalog, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_code', referencedColumnName: 'code' })
  plan!: PlanCatalog;
  @Column({ name: 'entitlement_code', type: 'varchar', length: 120 })
  entitlementCode!: string;
}

@Entity('subscriptions')
@Index(['organizationId'], { unique: true })
@Check('chk_subscriptions_tenant_scope', '"tenant_id" = "organization_id"')
export class Subscription {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId!: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenantOrganization!: Organization;
  @Column({ name: 'plan_code', type: 'varchar', length: 80 })
  planCode!: string;
  @ManyToOne(() => PlanCatalog, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plan_code', referencedColumnName: 'code' })
  plan!: PlanCatalog;
  @Column({ type: 'varchar', length: 24 }) status!: SubscriptionStatus;
  @Column({ name: 'trial_ends_at', type: DATE_COLUMN_TYPE, nullable: true })
  trialEndsAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: DATE_COLUMN_TYPE })
  createdAt!: Date;
}

@Entity('usage_ledger')
@Index(['organizationId', 'idempotencyKey'], { unique: true })
@Check('chk_usage_ledger_tenant_scope', '"tenant_id" = "organization_id"')
export class UsageLedger {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId!: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenantOrganization!: Organization;
  @Column({ type: 'varchar', length: 120 }) metric!: string;
  @Column({ type: 'integer' }) quantity!: number;
  @Column({ name: 'idempotency_key', type: 'varchar', length: 160 })
  idempotencyKey!: string;
  @Column({ name: 'payload_hash', type: 'varchar', length: 64 })
  payloadHash!: string;
  @CreateDateColumn({ name: 'recorded_at', type: DATE_COLUMN_TYPE })
  recordedAt!: Date;
}

export type OutboxStatus =
  'pending' | 'processing' | 'sent' | 'failed' | 'dead';

abstract class OutboxColumns {
  @Column({ name: 'idempotency_key', type: 'varchar', length: 160 })
  idempotencyKey!: string;
  @Column({ name: 'payload_hash', type: 'varchar', length: 64 })
  payloadHash!: string;
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: OutboxStatus;
  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount!: number;
  @Column({ name: 'available_at', type: DATE_COLUMN_TYPE })
  availableAt!: Date;
  @Column({ name: 'locked_at', type: DATE_COLUMN_TYPE, nullable: true })
  lockedAt!: Date | null;
  @Column({ name: 'lock_owner', type: 'varchar', length: 120, nullable: true })
  lockOwner!: string | null;
  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;
  @Column({ name: 'sent_at', type: DATE_COLUMN_TYPE, nullable: true })
  sentAt!: Date | null;
  @Column({ name: 'failed_at', type: DATE_COLUMN_TYPE, nullable: true })
  failedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: DATE_COLUMN_TYPE })
  createdAt!: Date;
}

@Entity('domain_outbox')
@Index(['organizationId', 'idempotencyKey'], { unique: true })
@Check('chk_domain_outbox_tenant_scope', '"tenant_id" = "organization_id"')
export class DomainOutbox extends OutboxColumns {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId!: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenantOrganization!: Organization;
  @Column({ type: 'varchar', length: 160 }) type!: string;
  @Column({ name: 'aggregate_id', type: 'varchar', length: 80 })
  aggregateId!: string;
  @Column({ type: JSON_COLUMN_TYPE }) payload!: unknown;
}

@Entity('email_outbox')
@Index(['idempotencyKey'], { unique: true })
@Check(
  'chk_email_outbox_tenant_scope',
  '("organization_id" IS NULL AND "tenant_id" IS NULL) OR ' +
    '("organization_id" IS NOT NULL AND "tenant_id" IS NOT NULL AND "tenant_id" = "organization_id")',
)
export class EmailOutbox extends OutboxColumns {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;
  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization | null;
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;
  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenantOrganization!: Organization | null;
  @Column({ type: 'varchar', length: 320 }) recipient!: string;
  @Column({ type: 'varchar', length: 120 }) template!: string;
  @Column({ type: JSON_COLUMN_TYPE }) payload!: unknown;
}
