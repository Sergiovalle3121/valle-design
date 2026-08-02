import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { JSON_COLUMN_TYPE } from '../../../common/database/json-column-type';
import { DATE_COLUMN_TYPE } from '../../../common/database/date-column-type';
@Entity('plan_catalog')
export class PlanCatalog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column({ name: 'code', length: 80 }) code: string;
  @Column({ default: true }) active: boolean;
  @Column({ type: JSON_COLUMN_TYPE, nullable: true }) metadata: Record<
    string,
    unknown
  > | null;
}
@Entity('plan_entitlements')
@Index(['planCode', 'entitlementCode'], { unique: true })
export class PlanEntitlement {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'plan_code', length: 80 }) planCode: string;
  @Column({ name: 'entitlement_code', length: 120 }) entitlementCode: string;
}
@Entity('subscriptions')
@Index(['organizationId'], { unique: true })
export class Subscription {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'organization_id', length: 36 }) organizationId: string;
  @Column({ name: 'tenant_id', length: 36 }) tenantId: string;
  @Column({ name: 'plan_code', length: 80 }) planCode: string;
  @Column({ length: 24 }) status: string;
  @Column({ name: 'trial_ends_at', type: DATE_COLUMN_TYPE, nullable: true })
  trialEndsAt: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
@Entity('usage_ledger')
@Index(['organizationId', 'idempotencyKey'], { unique: true })
export class UsageLedger {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'organization_id', length: 36 }) organizationId: string;
  @Column({ name: 'tenant_id', length: 36 }) tenantId: string;
  @Column({ length: 120 }) metric: string;
  @Column({ type: 'integer' }) quantity: number;
  @Column({ name: 'idempotency_key', length: 160 }) idempotencyKey: string;
  @CreateDateColumn({ name: 'recorded_at' }) recordedAt: Date;
}
@Entity('domain_outbox')
@Index(['organizationId', 'idempotencyKey'], { unique: true })
export class DomainOutbox {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'organization_id', length: 36 }) organizationId: string;
  @Column({ name: 'tenant_id', length: 36 }) tenantId: string;
  @Column({ length: 160 }) type: string;
  @Column({ name: 'aggregate_id', length: 80 }) aggregateId: string;
  @Column({ type: JSON_COLUMN_TYPE }) payload: unknown;
  @Column({ name: 'idempotency_key', length: 160 }) idempotencyKey: string;
  @Column({ default: 'pending', length: 20 }) status: string;
  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount: number;
  @Column({ name: 'available_at', type: DATE_COLUMN_TYPE }) availableAt: Date;
  @Column({ name: 'sent_at', type: DATE_COLUMN_TYPE, nullable: true })
  sentAt: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
@Entity('email_outbox')
@Index(['organizationId', 'idempotencyKey'], { unique: true })
export class EmailOutbox {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'organization_id', length: 36 }) organizationId: string;
  @Column({ name: 'tenant_id', length: 36 }) tenantId: string;
  @Column({ name: 'recipient', length: 320 }) recipient: string;
  @Column({ length: 120 }) template: string;
  @Column({ type: JSON_COLUMN_TYPE }) payload: unknown;
  @Column({ name: 'idempotency_key', length: 160 }) idempotencyKey: string;
  @Column({ default: 'pending', length: 20 }) status: string;
  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount: number;
  @Column({ name: 'available_at', type: DATE_COLUMN_TYPE }) availableAt: Date;
  @Column({ name: 'sent_at', type: DATE_COLUMN_TYPE, nullable: true })
  sentAt: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
