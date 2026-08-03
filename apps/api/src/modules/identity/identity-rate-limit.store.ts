export const IDENTITY_RATE_LIMIT_STORE = Symbol('IDENTITY_RATE_LIMIT_STORE');

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface IdentityRateLimitStore {
  consume(
    key: string,
    limit: number,
    windowMs: number,
  ): RateLimitDecision | Promise<RateLimitDecision>;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Bounded single-process fallback for development and tests.
 *
 * IdentityModule selects this only for local SQLite. PostgreSQL deployments
 * use the atomic shared store with expiry. `IDENTITY_RATE_LIMIT_KEY_SECRET`
 * is shared so account identifiers produce the same opaque key on every
 * process without persisting email/IP in clear.
 */
export class BoundedMemoryIdentityRateLimitStore implements IdentityRateLimitStore {
  private readonly entries = new Map<string, RateLimitEntry>();
  private nextExpiry = Number.POSITIVE_INFINITY;

  constructor(
    private readonly maxEntries = 10_000,
    private readonly clock: () => number = Date.now,
  ) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new RangeError('maxEntries must be a positive safe integer.');
    }
  }

  get size(): number {
    return this.entries.size;
  }

  consume(key: string, limit: number, windowMs: number): RateLimitDecision {
    if (!key || key.length > 256) {
      throw new RangeError('Rate-limit keys must contain 1 to 256 characters.');
    }
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new RangeError('Rate-limit limits must be positive safe integers.');
    }
    if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
      throw new RangeError(
        'Rate-limit windows must be positive safe integers.',
      );
    }

    const now = this.clock();
    if (now >= this.nextExpiry) {
      this.purgeExpired(now);
    }
    const current = this.entries.get(key);
    if (current) {
      if (current.count >= limit) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: Math.max(1, current.resetAt - now),
        };
      }

      current.count += 1;
      return {
        allowed: true,
        remaining: Math.max(0, limit - current.count),
        retryAfterMs: Math.max(0, current.resetAt - now),
      };
    }

    if (this.entries.size >= this.maxEntries) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Number.isFinite(this.nextExpiry)
          ? Math.max(1, this.nextExpiry - now)
          : windowMs,
      };
    }

    const resetAt = now + windowMs;
    this.entries.set(key, { count: 1, resetAt });
    this.nextExpiry = Math.min(this.nextExpiry, resetAt);
    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      retryAfterMs: windowMs,
    };
  }

  private purgeExpired(now: number): void {
    let nextExpiry = Number.POSITIVE_INFINITY;
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) {
        this.entries.delete(key);
      } else {
        nextExpiry = Math.min(nextExpiry, entry.resetAt);
      }
    }
    this.nextExpiry = nextExpiry;
  }
}
