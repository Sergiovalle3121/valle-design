import { DataSource } from 'typeorm';
import type {
  IdentityRateLimitStore,
  RateLimitDecision,
} from './identity-rate-limit.store';
import { IdentityRateLimit } from './entities/identity.entity';

interface CounterRow {
  count: number | string;
  retry_after_ms: number | string;
}

/** Atomic shared fixed-window limiter used by every PostgreSQL API replica. */
export class PostgresIdentityRateLimitStore implements IdentityRateLimitStore {
  constructor(private readonly database: DataSource) {}

  async consume(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitDecision> {
    assertInput(key, limit, windowMs);
    const table = escapedTablePath(
      this.database.getMetadata(IdentityRateLimit).tablePath,
    );
    const rows = await this.database.query<CounterRow[]>(
      `WITH expired AS (
         SELECT ctid
           FROM ${table}
          WHERE reset_at <= clock_timestamp()
            AND key <> $1
          ORDER BY reset_at ASC
          LIMIT 1000
       ), purged AS (
         DELETE FROM ${table}
          WHERE ctid IN (SELECT ctid FROM expired)
       )
       INSERT INTO ${table} AS counter
         (key, count, reset_at, updated_at)
       VALUES
         ($1, 1, clock_timestamp() + ($3::double precision * INTERVAL '1 millisecond'), clock_timestamp())
       ON CONFLICT (key) DO UPDATE
         SET count = CASE
               WHEN counter.reset_at <= clock_timestamp() THEN 1
               ELSE LEAST(counter.count + 1, $2 + 1)
             END,
             reset_at = CASE
               WHEN counter.reset_at <= clock_timestamp()
                 THEN clock_timestamp() + ($3::double precision * INTERVAL '1 millisecond')
               ELSE counter.reset_at
             END,
             updated_at = clock_timestamp()
       RETURNING count,
         GREATEST(
           0,
           EXTRACT(EPOCH FROM (reset_at - clock_timestamp())) * 1000
         )::bigint AS retry_after_ms`,
      [key, limit, windowMs],
    );
    const row = rows[0];
    if (!row) throw new Error('PostgreSQL rate limiter returned no counter.');
    const count = Number(row.count);
    const retryAfterMs = Math.max(1, Number(row.retry_after_ms));
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterMs,
    };
  }
}

function escapedTablePath(tablePath: string): string {
  return tablePath
    .split('.')
    .map((part) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(part)) {
        throw new Error('Identity rate-limit table path is invalid.');
      }
      return `"${part}"`;
    })
    .join('.');
}

function assertInput(key: string, limit: number, windowMs: number): void {
  if (!key || key.length > 256) {
    throw new RangeError('Rate-limit keys must contain 1 to 256 characters.');
  }
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError('Rate-limit limits must be positive safe integers.');
  }
  if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new RangeError('Rate-limit windows must be positive safe integers.');
  }
}
