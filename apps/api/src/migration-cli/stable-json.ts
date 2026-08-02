import { createHash } from 'node:crypto';

/**
 * JSON canónico ESTABLE (claves ordenadas recursivamente) para calcular hashes
 * de documentos inline comparables entre bases: `jsonb` de PostgreSQL no
 * conserva el orden de inserción de claves, así que `JSON.stringify` del mismo
 * documento leído de dos bases puede diferir byte a byte. Ordenando las claves
 * el hash depende SOLO del contenido.
 *
 * No se usa para persistir (los documentos viajan tal cual): únicamente para
 * huellas (manifiesto, verificación de paridad, detección de deltas).
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortValue(record[key]);
    }
    return sorted;
  }
  return value;
}

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Huella de contenido de un JSON (hash del canónico estable). */
export function stableSha256(value: unknown): string {
  return sha256Hex(stableStringify(value));
}
