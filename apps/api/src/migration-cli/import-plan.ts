import {
  cadBlobKeyFromStoredDocument,
  isStoredCadDocumentBlobPointer,
} from '../modules/cad-documents/cad-document-storage';
import type { BlobExportRecord, DocumentExportRecord } from './archive';

/**
 * Decisiones PURAS del importador (unit-testeables sin base):
 *
 * - upsert idempotente de documentos por (tenant, legacy_source_id): re-correr
 *   el import no duplica ni retrocede (guard monótono, mismo espíritu que la
 *   proyección WP3);
 * - resolución/dedup de blobs content-addressed en el destino;
 * - re-escritura del `_storage.blobKey` del puntero cuando el destino
 *   dedupli­có el contenido bajo otra clave.
 */

export interface ExistingDocument {
  id: string;
  cadDocumentVersion: number;
  contentSha256: string | null;
}

export type DocumentAction =
  | { action: 'insert' }
  | { action: 'update'; targetId: string }
  | {
      action: 'skip';
      targetId: string;
      reason: 'sin_cambios' | 'destino_mas_nuevo';
    };

export function planDocumentAction(
  existing: ExistingDocument | null,
  record: Pick<DocumentExportRecord, 'cadDocumentVersion' | 'contentSha256'>,
): DocumentAction {
  if (!existing) return { action: 'insert' };
  if (
    existing.cadDocumentVersion === record.cadDocumentVersion &&
    existing.contentSha256 === record.contentSha256
  ) {
    return { action: 'skip', targetId: existing.id, reason: 'sin_cambios' };
  }
  if (existing.cadDocumentVersion > record.cadDocumentVersion) {
    // El destino ya avanzó más allá del archivo (p. ej. import de un archivo
    // viejo tras un delta): NUNCA retroceder el CAS.
    return {
      action: 'skip',
      targetId: existing.id,
      reason: 'destino_mas_nuevo',
    };
  }
  return { action: 'update', targetId: existing.id };
}

export interface ExistingBlob {
  blobKey: string;
  size: number;
  gcMarkedAt: string | Date | null;
}

export type BlobAction =
  | { action: 'reuse'; targetBlobKey: string; resurrect: boolean }
  | { action: 'insert'; targetBlobKey: string }
  | { action: 'collision'; detail: string };

/**
 * Dedup content-addressed en destino: mismo (tenant, sha256) → se reutiliza la
 * fila existente (resucitándola si el GC la había marcado); sin fila → se
 * inserta CONSERVANDO la blobKey del origen (los punteros importados siguen
 * siendo válidos sin re-escritura). Colisión sha con tamaño distinto = alto.
 */
export function planBlobAction(
  existing: ExistingBlob | null,
  record: BlobExportRecord,
): BlobAction {
  if (existing) {
    if (existing.size !== record.size) {
      return {
        action: 'collision',
        detail: `sha256 ${record.sha256} ya existe en destino con tamaño ${existing.size} ≠ ${record.size}.`,
      };
    }
    return {
      action: 'reuse',
      targetBlobKey: existing.blobKey,
      resurrect: existing.gcMarkedAt !== null,
    };
  }
  return { action: 'insert', targetBlobKey: record.sourceBlobKey };
}

/**
 * Re-escribe la blobKey del puntero `_storage` cuando el destino resolvió el
 * contenido bajo OTRA clave (dedup). El sha256 del puntero jamás cambia — es
 * la identidad del contenido. Un documento inline vuelve tal cual.
 */
export function rewritePointerBlobKey(
  stored: Record<string, unknown>,
  resolveBlobKey: (sourceBlobKey: string, sha256: string) => string | null,
): { stored: Record<string, unknown>; changed: boolean; missing: boolean } {
  if (!isStoredCadDocumentBlobPointer(stored)) {
    return { stored, changed: false, missing: false };
  }
  const sourceKey = cadBlobKeyFromStoredDocument(stored);
  const sha = stored._storage.sha256.toLowerCase();
  const targetKey = sourceKey ? resolveBlobKey(sourceKey, sha) : null;
  if (!targetKey) {
    return { stored, changed: false, missing: true };
  }
  if (targetKey === sourceKey) {
    return { stored, changed: false, missing: false };
  }
  return {
    stored: {
      ...stored,
      _storage: { ...stored._storage, blobKey: targetKey },
    },
    changed: true,
    missing: false,
  };
}

export interface ExistingBlock {
  id: string;
  version: number;
  contentSha256: string;
}

export type BlockAction =
  | { action: 'insert' }
  | { action: 'update'; targetId: string }
  | {
      action: 'skip';
      targetId: string;
      reason: 'sin_cambios' | 'destino_mas_nuevo';
    };

export function planBlockAction(
  existing: ExistingBlock | null,
  record: { version: number; contentSha256: string },
): BlockAction {
  if (!existing) return { action: 'insert' };
  if (
    existing.version === record.version &&
    existing.contentSha256 === record.contentSha256
  ) {
    return { action: 'skip', targetId: existing.id, reason: 'sin_cambios' };
  }
  if (existing.version > record.version) {
    return {
      action: 'skip',
      targetId: existing.id,
      reason: 'destino_mas_nuevo',
    };
  }
  return { action: 'update', targetId: existing.id };
}
