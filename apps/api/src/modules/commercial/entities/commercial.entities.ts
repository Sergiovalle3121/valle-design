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
import { User } from '../../identity/entities/identity.entity';

export const PLAN_PRICE_PERIODS = ['monthly', 'yearly'] as const;
export type PlanPricePeriod = (typeof PLAN_PRICE_PERIODS)[number];

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

/**
 * Precio publicado de un plan del catálogo.
 *
 * Los precios son configuración GLOBAL del catálogo, igual que `plan_catalog`
 * y `plan_entitlements`: por eso esta tabla NO lleva las columnas
 * `organization_id`/`tenant_id` ni el CHECK de alcance de tenant (ADR-0005
 * gobierna datos de una organización; un precio pertenece al producto). El
 * índice único parcial permite conservar precios históricos desactivados y
 * garantiza a lo sumo UN precio activo por (plan, moneda, período).
 */
@Entity('plan_prices')
@Index(['planCode', 'currency', 'period'], { unique: true, where: '"active"' })
@Check('chk_plan_prices_amount', '"amount_cents" >= 0')
@Check('chk_plan_prices_period', `"period" IN ('monthly', 'yearly')`)
export class PlanPrice {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'plan_code', type: 'varchar', length: 80 })
  planCode!: string;
  @ManyToOne(() => PlanCatalog, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_code', referencedColumnName: 'code' })
  plan!: PlanCatalog;
  /** Código ISO-4217 en mayúsculas (p.ej. USD); la migración fija el formato. */
  @Column({ type: 'character', length: 3 })
  currency!: string;
  @Column({ type: 'varchar', length: 10 })
  period!: PlanPricePeriod;
  /** bigint: PostgreSQL lo devuelve como string, SQLite como number. */
  @Column({ name: 'amount_cents', type: 'bigint' })
  amountCents!: string | number;
  @Column({ type: 'boolean', default: true }) active!: boolean;
  @CreateDateColumn({ name: 'created_at', type: DATE_COLUMN_TYPE })
  createdAt!: Date;
}

@Entity('subscriptions')
@Index(['organizationId'], { unique: true })
// Una suscripción de la pasarela pertenece a UNA organización: el índice
// parcial lo impone en el esquema, no en el manejador del webhook.
@Index(['providerSubscriptionId'], {
  unique: true,
  where: '"provider_subscription_id" IS NOT NULL',
})
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
  /**
   * Fin del período ya pagado. Null mientras nadie haya cobrado (trial o plan
   * gratuito): es la diferencia entre «no vence» y «vence en tal fecha», y por
   * eso no se inventa un valor por defecto.
   */
  @Column({
    name: 'current_period_end',
    type: DATE_COLUMN_TYPE,
    nullable: true,
  })
  currentPeriodEnd!: Date | null;
  /** Baja programada: sigue vigente hasta `currentPeriodEnd`. */
  @Column({ name: 'cancel_at_period_end', type: 'boolean', default: false })
  cancelAtPeriodEnd!: boolean;
  /** Identidad en la pasarela; null mientras el cobro sea externo. */
  @Column({
    name: 'provider_subscription_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerSubscriptionId!: string | null;
  @Column({
    name: 'provider_customer_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerCustomerId!: string | null;
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

export const UPGRADE_INTENT_STATUSES = [
  'pending',
  'confirmed',
  'cancelled',
] as const;
export type UpgradeIntentStatus = (typeof UPGRADE_INTENT_STATUSES)[number];

/**
 * Asiento auditable del checkout sin pasarela: quién pidió pasar a qué plan y
 * quién lo decidió. La fila nunca se borra al decidirse — cambia de estado —
 * y el índice único parcial impide dos `pending` simultáneos por organización.
 */
@Entity('subscription_upgrade_intents')
@Index(['organizationId'], { unique: true, where: `"status" = 'pending'` })
@Check('chk_upgrade_intents_tenant_scope', '"tenant_id" = "organization_id"')
export class SubscriptionUpgradeIntent {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId!: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenantOrganization!: Organization;
  @Column({ name: 'requested_plan_code', type: 'varchar', length: 80 })
  requestedPlanCode!: string;
  @ManyToOne(() => PlanCatalog, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requested_plan_code', referencedColumnName: 'code' })
  requestedPlan!: PlanCatalog;
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: UpgradeIntentStatus;
  @Column({ name: 'requested_by_user_id', type: 'uuid' })
  requestedByUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requested_by_user_id' })
  requestedBy!: User;
  @Column({ name: 'decided_by_user_id', type: 'uuid', nullable: true })
  decidedByUserId!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'decided_by_user_id' })
  decidedBy!: User | null;
  @Column({ name: 'decided_at', type: DATE_COLUMN_TYPE, nullable: true })
  decidedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: DATE_COLUMN_TYPE })
  createdAt!: Date;
}

/**
 * Evento de la pasarela YA procesado. Es la barrera de idempotencia del
 * webhook y NADA más: no guarda el payload (puede contener datos de pago),
 * sólo su huella para poder auditar que una redelivery traía lo mismo.
 *
 * Sin `organization_id`/`tenant_id` a propósito: un evento llega ANTES de
 * saberse de quién es, y en algunos casos (evento de tipo desconocido) nunca
 * se sabrá. Afirmar un alcance de tenant que no se puede garantizar sería
 * mentir en el esquema; ADR-0005 gobierna filas que pertenecen a UNA
 * organización, y ésta pertenece al canal con el proveedor.
 */
@Entity('payment_events')
@Index(['eventId'], { unique: true })
export class PaymentEvent {
  @PrimaryGeneratedColumn('uuid') id!: string;
  /** Adaptador que lo emitió; `stripe` hoy. */
  @Column({ type: 'varchar', length: 40 }) provider!: string;
  /** Identificador del evento en el proveedor (`evt_…`): único global. */
  @Column({ name: 'event_id', type: 'varchar', length: 255 })
  eventId!: string;
  @Column({ type: 'varchar', length: 160 }) type!: string;
  @Column({ name: 'payload_hash', type: 'varchar', length: 64 })
  payloadHash!: string;
  /** Qué hizo el evento: útil para soporte sin volver a leer el payload. */
  @Column({ type: 'varchar', length: 40 }) outcome!: string;
  @CreateDateColumn({ name: 'received_at', type: DATE_COLUMN_TYPE })
  receivedAt!: Date;
}

export const INVOICE_STATUSES = [
  'paid',
  'open',
  'uncollectible',
  'void',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * ESPEJO de la factura del proveedor, no su sustituto.
 *
 * El documento fiscal lo emite y custodia la pasarela; aquí se guarda lo justo
 * para que el portal liste el historial sin llamar a Stripe en cada carga
 * (importe, moneda, estado, período y el enlace hospedado al documento real).
 * Lleva el CHECK de alcance de tenant como el resto de tablas por
 * organización (ADR-0005).
 */
@Entity('invoices')
@Index(['provider', 'providerInvoiceId'], { unique: true })
@Index(['organizationId', 'issuedAt'])
@Check('chk_invoices_tenant_scope', '"tenant_id" = "organization_id"')
@Check('chk_invoices_amount', '"amount_cents" >= 0')
export class Invoice {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId!: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenantOrganization!: Organization;
  @Column({ type: 'varchar', length: 40 }) provider!: string;
  @Column({ name: 'provider_invoice_id', type: 'varchar', length: 255 })
  providerInvoiceId!: string;
  /** Número legible del proveedor; puede faltar en borradores. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  number!: string | null;
  /** bigint: PostgreSQL lo devuelve como string, SQLite como number. */
  @Column({ name: 'amount_cents', type: 'bigint' })
  amountCents!: string | number;
  @Column({ type: 'character', length: 3 }) currency!: string;
  @Column({ type: 'varchar', length: 24 }) status!: InvoiceStatus;
  @Column({ name: 'period_start', type: DATE_COLUMN_TYPE, nullable: true })
  periodStart!: Date | null;
  @Column({ name: 'period_end', type: DATE_COLUMN_TYPE, nullable: true })
  periodEnd!: Date | null;
  /** URL hospedada por el proveedor; sólo se acepta HTTPS. */
  @Column({ name: 'hosted_url', type: 'text', nullable: true })
  hostedUrl!: string | null;
  @CreateDateColumn({ name: 'issued_at', type: DATE_COLUMN_TYPE })
  issuedAt!: Date;
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
