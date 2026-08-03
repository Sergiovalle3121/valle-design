import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';
import { DomainOutbox, EmailOutbox } from './entities/commercial.entities';

export const COMMERCIAL_OUTBOX_TRANSPORT = Symbol(
  'COMMERCIAL_OUTBOX_TRANSPORT',
);
export const COMMERCIAL_OUTBOX_OPTIONS = Symbol('COMMERCIAL_OUTBOX_OPTIONS');
export const COMMERCIAL_OUTBOX_OBSERVER = Symbol('COMMERCIAL_OUTBOX_OBSERVER');

export type CommercialOutboxQueue = 'domain' | 'email';

interface OutboxMessageBase {
  id: string;
  organizationId: string | null;
  tenantId: string | null;
  idempotencyKey: string;
  payload: unknown;
}

export interface DomainOutboxMessage extends OutboxMessageBase {
  queue: 'domain';
  organizationId: string;
  tenantId: string;
  type: string;
  aggregateId: string;
}

export interface EmailOutboxMessage extends OutboxMessageBase {
  queue: 'email';
  recipient: string;
  template: string;
}

export type CommercialOutboxMessage = DomainOutboxMessage | EmailOutboxMessage;

export interface CommercialOutboxDeliveryContext {
  /**
   * Stable across retries and expired-lease recovery. The downstream handler
   * must forward this value to a provider that supports idempotent delivery or
   * persist it in its own deduplication store.
   */
  idempotencyKey: string;
  attemptCount: number;
  queue: CommercialOutboxQueue;
}

export interface CommercialOutboxTransport {
  deliver(
    message: CommercialOutboxMessage,
    context: CommercialOutboxDeliveryContext,
  ): Promise<void>;
}

export type CommercialOutboxObservation =
  | {
      event: 'claimed' | 'sent';
      queue: CommercialOutboxQueue;
      outboxId: string;
      attemptCount: number;
    }
  | {
      event: 'retry_scheduled';
      queue: CommercialOutboxQueue;
      outboxId: string;
      attemptCount: number;
      delayMs: number;
      failureKind: string;
    }
  | {
      event: 'dead';
      queue: CommercialOutboxQueue;
      outboxId: string;
      attemptCount: number;
      failureKind: string;
    }
  | {
      event: 'lease_lost';
      queue: CommercialOutboxQueue;
      outboxId: string;
      attemptCount: number;
    };

/**
 * Observations deliberately exclude recipient, payload, tenant, organization,
 * idempotency key and provider error text so telemetry cannot leak PII.
 */
export interface CommercialOutboxObserver {
  observe(event: CommercialOutboxObservation): void | Promise<void>;
}

export interface CommercialOutboxDispatcherOptions {
  workerId?: string;
  /** Maximum number claimed across both queues in one pass. */
  batchSize?: number;
  maxAttempts?: number;
  leaseMs?: number;
  heartbeatMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  jitterRatio?: number;
  random?: () => number;
}

export interface CommercialOutboxDispatchSummary {
  claimed: number;
  sent: number;
  failed: number;
  dead: number;
  leaseLost: number;
}

export class UnsupportedOutboxDriverError extends Error {
  constructor(driver: string) {
    super(
      `Commercial outbox dispatch requires PostgreSQL FOR UPDATE SKIP LOCKED; ` +
        `driver "${driver}" cannot provide the required multi-worker lease semantics. ` +
        'Keep the dispatcher disabled for local SQLite or run PostgreSQL.',
    );
    this.name = 'UnsupportedOutboxDriverError';
  }
}

export class CommercialOutboxLeaseLostError extends Error {
  constructor() {
    super('The commercial outbox lease is no longer owned by this worker.');
    this.name = 'CommercialOutboxLeaseLostError';
  }
}

class MissingCommercialOutboxTransportError extends Error {
  constructor() {
    super('No commercial outbox transport is configured.');
    this.name = 'MissingCommercialOutboxTransportError';
  }
}

type RuntimeOptions = Required<
  Omit<CommercialOutboxDispatcherOptions, 'heartbeatMs'>
> & { heartbeatMs: number };

interface RawClaim {
  id: string;
  organization_id: string | null;
  tenant_id: string | null;
  idempotency_key: string;
  payload: unknown;
  attempt_count: number | string;
  type?: string;
  aggregate_id?: string;
  recipient?: string;
  template?: string;
}

interface ClaimedMessage {
  queue: CommercialOutboxQueue;
  row: RawClaim;
  leaseOwner: string;
}

interface ExhaustedMessage {
  queue: CommercialOutboxQueue;
  id: string;
  attemptCount: number;
}

const QUEUE_RETURNING: Readonly<Record<CommercialOutboxQueue, string>> = {
  domain:
    'o.id, o.organization_id, o.tenant_id, o.idempotency_key, o.payload, ' +
    'o.attempt_count, o.type, o.aggregate_id',
  email:
    'o.id, o.organization_id, o.tenant_id, o.idempotency_key, o.payload, ' +
    'o.attempt_count, o.recipient, o.template',
};

@Injectable()
export class CommercialOutboxDispatcher {
  private readonly settings: RuntimeOptions;
  private firstQueue: CommercialOutboxQueue = 'domain';

  constructor(
    private readonly db: DataSource,
    @Optional()
    @Inject(COMMERCIAL_OUTBOX_TRANSPORT)
    private readonly transport?: CommercialOutboxTransport,
    @Optional()
    @Inject(COMMERCIAL_OUTBOX_OPTIONS)
    options: CommercialOutboxDispatcherOptions = {},
    @Optional()
    @Inject(COMMERCIAL_OUTBOX_OBSERVER)
    private readonly observer?: CommercialOutboxObserver,
  ) {
    this.settings = resolveOptions(options);
  }

  /**
   * Claims and delivers one bounded batch. The caller owns polling/scheduling.
   * Delivery is at-least-once; downstream deduplication uses idempotencyKey.
   */
  async dispatchOnce(): Promise<CommercialOutboxDispatchSummary> {
    this.assertPostgres();

    const summary: CommercialOutboxDispatchSummary = {
      claimed: 0,
      sent: 0,
      failed: 0,
      dead: 0,
      leaseLost: 0,
    };
    const { claimed, exhausted } = await this.claimBatch();
    summary.claimed = claimed.length;
    summary.dead = exhausted.length;

    for (const row of exhausted) {
      await this.observe({
        event: 'dead',
        queue: row.queue,
        outboxId: row.id,
        attemptCount: row.attemptCount,
        failureKind: 'attempts_exhausted',
      });
    }

    for (const claim of claimed) {
      const attemptCount = parseAttemptCount(claim.row.attempt_count);
      await this.observe({
        event: 'claimed',
        queue: claim.queue,
        outboxId: claim.row.id,
        attemptCount,
      });

      try {
        const message = toMessage(claim);
        await this.deliverWithHeartbeat(
          message,
          attemptCount,
          claim.leaseOwner,
        );
        if (
          !(await this.markSent(claim.queue, claim.row.id, claim.leaseOwner))
        ) {
          throw new CommercialOutboxLeaseLostError();
        }
        summary.sent += 1;
        await this.observe({
          event: 'sent',
          queue: claim.queue,
          outboxId: claim.row.id,
          attemptCount,
        });
      } catch (error) {
        if (error instanceof CommercialOutboxLeaseLostError) {
          summary.leaseLost += 1;
          await this.observe({
            event: 'lease_lost',
            queue: claim.queue,
            outboxId: claim.row.id,
            attemptCount,
          });
          continue;
        }

        const dead = attemptCount >= this.settings.maxAttempts;
        const delayMs = dead ? 0 : this.retryDelayMs(attemptCount);
        const failureKind = safeErrorKind(error);
        const updated = await this.markFailed(
          claim.queue,
          claim.row.id,
          error,
          dead,
          delayMs,
          claim.leaseOwner,
        );
        if (!updated) {
          summary.leaseLost += 1;
          await this.observe({
            event: 'lease_lost',
            queue: claim.queue,
            outboxId: claim.row.id,
            attemptCount,
          });
          continue;
        }

        if (dead) {
          summary.dead += 1;
          await this.observe({
            event: 'dead',
            queue: claim.queue,
            outboxId: claim.row.id,
            attemptCount,
            failureKind,
          });
        } else {
          summary.failed += 1;
          await this.observe({
            event: 'retry_scheduled',
            queue: claim.queue,
            outboxId: claim.row.id,
            attemptCount,
            delayMs,
            failureKind,
          });
        }
      }
    }

    return summary;
  }

  private assertPostgres(): void {
    const driver = String(this.db.options.type);
    if (driver !== 'postgres') {
      throw new UnsupportedOutboxDriverError(driver);
    }
  }

  private async claimBatch(): Promise<{
    claimed: ClaimedMessage[];
    exhausted: ExhaustedMessage[];
  }> {
    const queryRunner = this.db.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();
      try {
        const leaseOwner = `${this.settings.workerId}:${randomUUID()}`;
        const queues: CommercialOutboxQueue[] =
          this.firstQueue === 'domain'
            ? ['domain', 'email']
            : ['email', 'domain'];
        this.firstQueue = this.firstQueue === 'domain' ? 'email' : 'domain';

        const exhausted: ExhaustedMessage[] = [];
        for (const queue of queues) {
          const rows = await this.markExhausted(queryRunner, queue);
          exhausted.push(
            ...rows.map((row) => ({
              queue,
              id: row.id,
              attemptCount: parseAttemptCount(row.attempt_count),
            })),
          );
        }

        const claimed: ClaimedMessage[] = [];
        let remaining = this.settings.batchSize;
        for (const queue of queues) {
          if (remaining === 0) break;
          const rows = await this.claimQueue(
            queryRunner,
            queue,
            remaining,
            leaseOwner,
          );
          claimed.push(...rows.map((row) => ({ queue, row, leaseOwner })));
          remaining -= rows.length;
        }

        await queryRunner.commitTransaction();
        return { claimed, exhausted };
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      }
    } finally {
      await queryRunner.release();
    }
  }

  private async markExhausted(
    queryRunner: QueryRunner,
    queue: CommercialOutboxQueue,
  ): Promise<Array<{ id: string; attempt_count: number | string }>> {
    const table = this.tableName(queue);
    const result: unknown = await queryRunner.query(
      `WITH exhausted_candidates AS (
         SELECT id
           FROM ${table}
          WHERE attempt_count >= $1
            AND (
              (status IN ('pending', 'failed') AND available_at <= clock_timestamp())
              OR (
                status = 'processing'
                AND (
                  locked_at IS NULL
                  OR locked_at <= clock_timestamp() - ($2::double precision * INTERVAL '1 millisecond')
                )
              )
            )
          ORDER BY available_at ASC, created_at ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT $3
       )
       UPDATE ${table} AS o
          SET status = 'dead',
              failed_at = clock_timestamp(),
              locked_at = NULL,
              lock_owner = NULL,
              last_error = COALESCE(last_error, $4)
         FROM exhausted_candidates AS c
        WHERE o.id = c.id
      RETURNING o.id, o.attempt_count`,
      [
        this.settings.maxAttempts,
        this.settings.leaseMs,
        this.settings.batchSize,
        'Lease expired after the maximum delivery attempts.',
      ],
    );
    return resultRows(result) as Array<{
      id: string;
      attempt_count: number | string;
    }>;
  }

  private async claimQueue(
    queryRunner: QueryRunner,
    queue: CommercialOutboxQueue,
    limit: number,
    leaseOwner: string,
  ): Promise<RawClaim[]> {
    const table = this.tableName(queue);
    const returning = QUEUE_RETURNING[queue];
    const result: unknown = await queryRunner.query(
      `WITH candidates AS (
         SELECT id
           FROM ${table}
          WHERE attempt_count < $2
            AND (
              (status IN ('pending', 'failed') AND available_at <= clock_timestamp())
              OR (
                status = 'processing'
                AND (
                  locked_at IS NULL
                  OR locked_at <= clock_timestamp() - ($1::double precision * INTERVAL '1 millisecond')
                )
              )
            )
          ORDER BY available_at ASC, created_at ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT $3
       )
       UPDATE ${table} AS o
          SET status = 'processing',
              attempt_count = o.attempt_count + 1,
              locked_at = clock_timestamp(),
              lock_owner = $4,
              failed_at = NULL
         FROM candidates AS c
        WHERE o.id = c.id
      RETURNING ${returning}`,
      [this.settings.leaseMs, this.settings.maxAttempts, limit, leaseOwner],
    );
    return resultRows(result) as RawClaim[];
  }

  private async deliverWithHeartbeat(
    message: CommercialOutboxMessage,
    attemptCount: number,
    leaseOwner: string,
  ): Promise<void> {
    if (!this.transport) {
      throw new MissingCommercialOutboxTransportError();
    }

    let leaseLost = false;
    let renewal = Promise.resolve();
    const renew = () => {
      renewal = renewal.then(async () => {
        if (!(await this.renewLease(message.queue, message.id, leaseOwner))) {
          leaseLost = true;
        }
      });
    };
    const heartbeat =
      this.settings.heartbeatMs > 0
        ? setInterval(renew, this.settings.heartbeatMs)
        : undefined;
    heartbeat?.unref();

    let deliveryError: unknown;
    try {
      await this.transport.deliver(message, {
        idempotencyKey: message.idempotencyKey,
        attemptCount,
        queue: message.queue,
      });
    } catch (error) {
      deliveryError = error;
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      try {
        await renewal;
      } catch {
        leaseLost = true;
      }
    }

    if (leaseLost) throw new CommercialOutboxLeaseLostError();
    if (deliveryError !== undefined) throw toError(deliveryError);
  }

  private async renewLease(
    queue: CommercialOutboxQueue,
    id: string,
    leaseOwner: string,
  ): Promise<boolean> {
    const table = this.tableName(queue);
    const result: unknown = await this.db.query(
      `UPDATE ${table}
          SET locked_at = clock_timestamp()
        WHERE id = $1
          AND status = 'processing'
          AND lock_owner = $2
      RETURNING id`,
      [id, leaseOwner],
    );
    return resultRows(result).length === 1;
  }

  private async markSent(
    queue: CommercialOutboxQueue,
    id: string,
    leaseOwner: string,
  ): Promise<boolean> {
    const table = this.tableName(queue);
    const result: unknown = await this.db.query(
      `UPDATE ${table}
          SET status = 'sent',
              sent_at = clock_timestamp(),
              locked_at = NULL,
              lock_owner = NULL,
              last_error = NULL
        WHERE id = $1
          AND status = 'processing'
          AND lock_owner = $2
      RETURNING id`,
      [id, leaseOwner],
    );
    return resultRows(result).length === 1;
  }

  private async markFailed(
    queue: CommercialOutboxQueue,
    id: string,
    error: unknown,
    dead: boolean,
    delayMs: number,
    leaseOwner: string,
  ): Promise<boolean> {
    const table = this.tableName(queue);
    const result: unknown = await this.db.query(
      `UPDATE ${table}
          SET status = $1,
              available_at = clock_timestamp() + ($2::double precision * INTERVAL '1 millisecond'),
              failed_at = clock_timestamp(),
              locked_at = NULL,
              lock_owner = NULL,
              last_error = $3
        WHERE id = $4
          AND status = 'processing'
          AND lock_owner = $5
      RETURNING id`,
      [
        dead ? 'dead' : 'failed',
        delayMs,
        safeErrorSummary(error),
        id,
        leaseOwner,
      ],
    );
    return resultRows(result).length === 1;
  }

  private retryDelayMs(attemptCount: number): number {
    const exponent = Math.max(0, attemptCount - 1);
    const uncapped = this.settings.baseBackoffMs * 2 ** exponent;
    const capped = Math.min(uncapped, this.settings.maxBackoffMs);
    const jitter =
      capped * this.settings.jitterRatio * (this.settings.random() * 2 - 1);
    return Math.max(0, Math.round(capped + jitter));
  }

  private tableName(queue: CommercialOutboxQueue): string {
    const entity = queue === 'domain' ? DomainOutbox : EmailOutbox;
    return escapedTablePath(this.db.getMetadata(entity).tablePath);
  }

  private async observe(event: CommercialOutboxObservation): Promise<void> {
    try {
      await this.observer?.observe(event);
    } catch {
      // Delivery correctness must not depend on telemetry availability.
    }
  }
}

function resolveOptions(
  options: CommercialOutboxDispatcherOptions,
): RuntimeOptions {
  const leaseMs = options.leaseMs ?? 60_000;
  const heartbeatMs = options.heartbeatMs ?? Math.floor(leaseMs / 3);
  const resolved: RuntimeOptions = {
    workerId: options.workerId ?? `outbox-${process.pid}-${randomUUID()}`,
    batchSize: options.batchSize ?? 20,
    maxAttempts: options.maxAttempts ?? 8,
    leaseMs,
    heartbeatMs,
    baseBackoffMs: options.baseBackoffMs ?? 1_000,
    maxBackoffMs: options.maxBackoffMs ?? 15 * 60_000,
    jitterRatio: options.jitterRatio ?? 0.2,
    random: options.random ?? Math.random,
  };

  assertInteger('batchSize', resolved.batchSize, 1, 1_000);
  assertInteger('maxAttempts', resolved.maxAttempts, 1, 100);
  assertInteger('leaseMs', resolved.leaseMs, 1_000, 24 * 60 * 60_000);
  assertInteger('heartbeatMs', resolved.heartbeatMs, 0, resolved.leaseMs - 1);
  assertInteger('baseBackoffMs', resolved.baseBackoffMs, 1, 24 * 60 * 60_000);
  assertInteger(
    'maxBackoffMs',
    resolved.maxBackoffMs,
    resolved.baseBackoffMs,
    7 * 24 * 60 * 60_000,
  );
  if (
    !Number.isFinite(resolved.jitterRatio) ||
    resolved.jitterRatio < 0 ||
    resolved.jitterRatio > 1
  ) {
    throw new Error('jitterRatio must be between 0 and 1.');
  }
  if (!/^[A-Za-z0-9._:-]{1,80}$/.test(resolved.workerId)) {
    throw new Error(
      'workerId must contain only A-Z, a-z, 0-9, dot, underscore, colon or dash (max 80).',
    );
  }
  return resolved;
}

function assertInteger(
  name: string,
  value: number,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer from ${minimum} to ${maximum}.`,
    );
  }
}

function parseAttemptCount(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error('Outbox attempt_count returned an invalid value.');
  }
  return parsed;
}

function toMessage(claim: ClaimedMessage): CommercialOutboxMessage {
  const { queue, row } = claim;
  requireString(row.id, 'id');
  requireString(row.idempotency_key, 'idempotency_key');

  if (queue === 'domain') {
    requireString(row.organization_id, 'organization_id');
    requireString(row.tenant_id, 'tenant_id');
    requireString(row.type, 'type');
    requireString(row.aggregate_id, 'aggregate_id');
    return {
      queue,
      id: row.id,
      organizationId: row.organization_id,
      tenantId: row.tenant_id,
      type: row.type,
      aggregateId: row.aggregate_id,
      idempotencyKey: row.idempotency_key,
      payload: row.payload,
    };
  }

  requireNullableString(row.organization_id, 'organization_id');
  requireNullableString(row.tenant_id, 'tenant_id');
  requireString(row.recipient, 'recipient');
  requireString(row.template, 'template');
  return {
    queue,
    id: row.id,
    organizationId: row.organization_id,
    tenantId: row.tenant_id,
    recipient: row.recipient,
    template: row.template,
    idempotencyKey: row.idempotency_key,
    payload: row.payload,
  };
}

function requireString(
  value: string | null | undefined,
  column: string,
): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Outbox row returned an invalid ${column}.`);
  }
}

function requireNullableString(
  value: string | null | undefined,
  column: string,
): asserts value is string | null {
  if (value !== null && typeof value !== 'string') {
    throw new Error(`Outbox row returned an invalid ${column}.`);
  }
}

function escapedTablePath(tablePath: string): string {
  return tablePath
    .split('.')
    .map((part) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(part)) {
        throw new Error('Commercial outbox table path is invalid.');
      }
      return `"${part}"`;
    })
    .join('.');
}

function resultRows(result: unknown): unknown[] {
  if (!Array.isArray(result)) {
    throw new Error('PostgreSQL outbox query did not return a row array.');
  }
  // TypeORM's PostgreSQL runner may expose UPDATE ... RETURNING either as the
  // row array or as [rows, affectedCount], depending on the query path.
  if (
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  ) {
    return result[0];
  }
  return result;
}

function safeErrorKind(error: unknown): string {
  const candidate = error instanceof Error ? error.name : 'DeliveryError';
  return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(candidate)
    ? candidate
    : 'DeliveryError';
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : 'Delivery failed.');
}

/** A bounded diagnostic for persistence; provider text is aggressively redacted. */
function safeErrorSummary(error: unknown): string {
  const kind = safeErrorKind(error);
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Delivery failed.';
  const redacted = message
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[redacted-email]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(
      /\b(token|secret|password|authorization|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[redacted]',
    )
    .replace(/([?&])[^=\s]+=[^&\s]+/g, '$1[redacted]')
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      '[redacted-id]',
    )
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted-token]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 500);
  return redacted.length > 0 ? `${kind}: ${redacted}` : kind;
}
