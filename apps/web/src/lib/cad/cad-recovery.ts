import type { CadDocument } from './cad-document';
import {
  decodeCadRecoveryOffThread,
  encodeCadRecoveryOffThread,
} from './cad-recovery-worker-client';
import type { CadRecoveryPayloadFormat } from './cad-recovery-codec';

const DATABASE_NAME = 'cad-recovery';
const LEGACY_STORE_NAME = 'checkpoints';
const JOURNAL_STORE_NAME = 'journal';
const DATABASE_VERSION = 2;
const MAX_RECOVERY_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CHECKPOINTS_PER_SCOPE = 3;
const MAX_GLOBAL_CHECKPOINTS = 24;

export interface CadRecoveryScope {
  tenantId: string;
  userId: string;
  buildingId?: string | null;
  projectId?: string | null;
  model: string;
  revision: string;
}

export interface CadRecoveryRecord {
  key: string;
  scopeKey: string;
  document: CadDocument;
  baseCadDocumentVersion: number;
  savedAt: string;
  savedAtMs: number;
  journalSequence: number;
  format: CadRecoveryPayloadFormat | 'legacy-object';
  uncompressedBytes: number;
  storedBytes: number;
  sha256?: string;
  encoder?: 'worker' | 'main-thread-fallback';
}

interface StoredCadRecoveryRecord {
  key: string;
  scopeKey: string;
  baseCadDocumentVersion: number;
  savedAt: string;
  savedAtMs: number;
  journalSequence: number;
  format: CadRecoveryPayloadFormat;
  payload: Blob;
  uncompressedBytes: number;
  storedBytes: number;
  sha256: string;
  encoder: 'worker' | 'main-thread-fallback';
}

interface LegacyCadRecoveryRecord {
  key: string;
  document: CadDocument;
  baseCadDocumentVersion: number;
  savedAt: string;
  savedAtMs: number;
}

export class CadRecoveryQuotaError extends Error {
  constructor() {
    super('El almacenamiento local está lleno; guarda el dibujo en el servidor para proteger los cambios.');
    this.name = 'CadRecoveryQuotaError';
  }
}

function part(value: string | null | undefined): string {
  return encodeURIComponent((value ?? '-').trim() || '-');
}

export function cadRecoveryScopeKey(scope: CadRecoveryScope): string {
  return [
    'cad-recovery-v1',
    part(scope.tenantId),
    part(scope.userId),
    part(scope.buildingId),
    part(scope.projectId),
    part(scope.model),
    part(scope.revision),
  ].join(':');
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined')
    return Promise.reject(new Error('IndexedDB no está disponible.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LEGACY_STORE_NAME))
        database.createObjectStore(LEGACY_STORE_NAME, { keyPath: 'key' });
      if (!database.objectStoreNames.contains(JOURNAL_STORE_NAME)) {
        const journal = database.createObjectStore(JOURNAL_STORE_NAME, { keyPath: 'key' });
        journal.createIndex('by_scope_saved', ['scopeKey', 'savedAtMs']);
        journal.createIndex('by_saved', 'savedAtMs');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir la recuperación CAD.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falló la operación de recuperación CAD.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('La transacción de recovery fue cancelada.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Falló la transacción de recovery.'));
  });
}

async function scopeJournal(
  database: IDBDatabase,
  scopeKey: string,
): Promise<StoredCadRecoveryRecord[]> {
  const transaction = database.transaction(JOURNAL_STORE_NAME, 'readonly');
  const range = IDBKeyRange.bound(
    [scopeKey, 0],
    [scopeKey, Number.MAX_SAFE_INTEGER],
  );
  const records = await requestResult(
    transaction.objectStore(JOURNAL_STORE_NAME).index('by_scope_saved').getAll(range),
  ) as StoredCadRecoveryRecord[];
  return records.sort((left, right) => right.savedAtMs - left.savedAtMs);
}

async function deleteJournalKeys(database: IDBDatabase, keys: string[]): Promise<void> {
  if (!keys.length) return;
  const transaction = database.transaction(JOURNAL_STORE_NAME, 'readwrite');
  const store = transaction.objectStore(JOURNAL_STORE_NAME);
  for (const key of new Set(keys)) store.delete(key);
  await transactionDone(transaction);
}

async function pruneJournal(database: IDBDatabase, aggressive = false): Promise<void> {
  const transaction = database.transaction(JOURNAL_STORE_NAME, 'readonly');
  const records = await requestResult(
    transaction.objectStore(JOURNAL_STORE_NAME).getAll(),
  ) as StoredCadRecoveryRecord[];
  const now = Date.now();
  const byScope = new Map<string, StoredCadRecoveryRecord[]>();
  for (const record of records) {
    const group = byScope.get(record.scopeKey) ?? [];
    group.push(record);
    byScope.set(record.scopeKey, group);
  }
  const remove = new Set<string>();
  for (const group of byScope.values()) {
    group.sort((left, right) => right.savedAtMs - left.savedAtMs);
    group.forEach((record, index) => {
      if (now - record.savedAtMs > MAX_RECOVERY_AGE_MS) remove.add(record.key);
      else if (index >= (aggressive ? 1 : MAX_CHECKPOINTS_PER_SCOPE)) remove.add(record.key);
    });
  }
  const retained = records
    .filter((record) => !remove.has(record.key))
    .sort((left, right) => right.savedAtMs - left.savedAtMs);
  retained.slice(MAX_GLOBAL_CHECKPOINTS).forEach((record) => remove.add(record.key));
  await deleteJournalKeys(database, [...remove]);
}

async function storageLikelyFull(requiredBytes: number): Promise<boolean> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate?.quota || estimate.usage === undefined) return false;
    return estimate.quota - estimate.usage < requiredBytes * 1.25;
  } catch {
    return false;
  }
}

function isQuotaError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'QuotaExceededError';
}

async function putJournalRecord(
  database: IDBDatabase,
  record: StoredCadRecoveryRecord,
): Promise<void> {
  const transaction = database.transaction(JOURNAL_STORE_NAME, 'readwrite');
  transaction.objectStore(JOURNAL_STORE_NAME).put(record);
  await transactionDone(transaction);
}

export async function saveCadRecovery(
  scope: CadRecoveryScope,
  document: CadDocument,
  baseCadDocumentVersion: number,
): Promise<CadRecoveryRecord> {
  const encoded = await encodeCadRecoveryOffThread(document);
  const database = await openDatabase();
  const scopeKey = cadRecoveryScopeKey(scope);
  try {
    if (await storageLikelyFull(encoded.storedBytes)) await pruneJournal(database, true);
    const existing = await scopeJournal(database, scopeKey);
    const savedAtMs = Date.now();
    const journalSequence = (existing[0]?.journalSequence ?? 0) + 1;
    const stored: StoredCadRecoveryRecord = {
      key: `${scopeKey}:j:${String(journalSequence).padStart(8, '0')}:${savedAtMs}`,
      scopeKey,
      baseCadDocumentVersion,
      savedAt: new Date(savedAtMs).toISOString(),
      savedAtMs,
      journalSequence,
      format: encoded.format,
      payload: new Blob([encoded.buffer], { type: encoded.format === 'gzip-json' ? 'application/gzip' : 'application/json' }),
      uncompressedBytes: encoded.uncompressedBytes,
      storedBytes: encoded.storedBytes,
      sha256: encoded.sha256,
      encoder: encoded.encoder === 'worker' ? 'worker' : 'main-thread-fallback',
    };
    try {
      await putJournalRecord(database, stored);
    } catch (cause) {
      if (!isQuotaError(cause)) throw cause;
      await pruneJournal(database, true);
      try {
        await putJournalRecord(database, stored);
      } catch (retryCause) {
        if (isQuotaError(retryCause)) throw new CadRecoveryQuotaError();
        throw retryCause;
      }
    }
    await pruneJournal(database);
    return { ...stored, document };
  } finally {
    database.close();
  }
}

export async function loadCadRecovery(
  scope: CadRecoveryScope,
): Promise<CadRecoveryRecord | null> {
  const database = await openDatabase();
  const scopeKey = cadRecoveryScopeKey(scope);
  try {
    const records = await scopeJournal(database, scopeKey);
    const expiredKeys: string[] = [];
    for (const record of records) {
      if (!Number.isFinite(record.savedAtMs) || Date.now() - record.savedAtMs > MAX_RECOVERY_AGE_MS) {
        expiredKeys.push(record.key);
        continue;
      }
      try {
        // El hash guardado se COMPRUEBA aquí. Si no cuadra, el registro se
        // trata como dañado: se descarta y el bucle continúa con el checkpoint
        // anterior, en vez de devolver al usuario un plano que no es el suyo.
        const document = await decodeCadRecoveryOffThread(
          record.format,
          await record.payload.arrayBuffer(),
          record.sha256,
        );
        if (expiredKeys.length) await deleteJournalKeys(database, expiredKeys);
        return { ...record, document };
      } catch {
        expiredKeys.push(record.key);
      }
    }
    if (expiredKeys.length) await deleteJournalKeys(database, expiredKeys);

    const legacyTransaction = database.transaction(LEGACY_STORE_NAME, 'readonly');
    const legacy = await requestResult(
      legacyTransaction.objectStore(LEGACY_STORE_NAME).get(scopeKey),
    ) as LegacyCadRecoveryRecord | undefined;
    if (!legacy || !Number.isFinite(legacy.savedAtMs) || Date.now() - legacy.savedAtMs > MAX_RECOVERY_AGE_MS)
      return null;
    return {
      ...legacy,
      scopeKey,
      journalSequence: 0,
      format: 'legacy-object',
      uncompressedBytes: 0,
      storedBytes: 0,
    };
  } finally {
    database.close();
  }
}

export async function clearCadRecovery(scope: CadRecoveryScope): Promise<void> {
  const database = await openDatabase();
  const scopeKey = cadRecoveryScopeKey(scope);
  try {
    const records = await scopeJournal(database, scopeKey);
    await deleteJournalKeys(database, records.map((record) => record.key));
    const transaction = database.transaction(LEGACY_STORE_NAME, 'readwrite');
    transaction.objectStore(LEGACY_STORE_NAME).delete(scopeKey);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}
