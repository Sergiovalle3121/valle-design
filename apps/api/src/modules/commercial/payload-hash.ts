import { createHash } from 'node:crypto';

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('base64');
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] !== undefined) sorted[key] = canonicalValue(source[key]);
    }
    return sorted;
  }
  return value;
}

/** Stable content hash used to reject conflicting idempotency-key reuse. */
export function commercialPayloadHash(value: unknown): string {
  const canonical = JSON.stringify(canonicalValue(value)) ?? 'undefined';
  return createHash('sha256').update(canonical).digest('hex');
}

export class IdempotencyConflictError extends Error {
  readonly code = 'idempotency_key_conflict';

  constructor(readonly idempotencyKey: string) {
    super(
      `La clave idempotente ${idempotencyKey} ya existe con una carga diferente.`,
    );
    this.name = 'IdempotencyConflictError';
  }
}
