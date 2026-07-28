import type { CadDocument } from "./cad-document";

const DATABASE_NAME = "axos-cad-recovery";
const STORE_NAME = "checkpoints";
const DATABASE_VERSION = 1;
const MAX_RECOVERY_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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
  document: CadDocument;
  baseCadDocumentVersion: number;
  savedAt: string;
  savedAtMs: number;
}

function part(value: string | null | undefined): string {
  return encodeURIComponent((value ?? "-").trim() || "-");
}

export function cadRecoveryScopeKey(scope: CadRecoveryScope): string {
  return [
    "cad-recovery-v1",
    part(scope.tenantId),
    part(scope.userId),
    part(scope.buildingId),
    part(scope.projectId),
    part(scope.model),
    part(scope.revision),
  ].join(":");
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB no está disponible."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ?? new Error("No se pudo abrir la recuperación CAD."),
      );
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ?? new Error("Falló la operación de recuperación CAD."),
      );
  });
}

export async function saveCadRecovery(
  scope: CadRecoveryScope,
  document: CadDocument,
  baseCadDocumentVersion: number,
): Promise<CadRecoveryRecord> {
  const database = await openDatabase();
  const savedAtMs = Date.now();
  const record: CadRecoveryRecord = {
    key: cadRecoveryScopeKey(scope),
    document,
    baseCadDocumentVersion,
    savedAt: new Date(savedAtMs).toISOString(),
    savedAtMs,
  };
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    await requestResult(transaction.objectStore(STORE_NAME).put(record));
    return record;
  } finally {
    database.close();
  }
}

export async function loadCadRecovery(
  scope: CadRecoveryScope,
): Promise<CadRecoveryRecord | null> {
  const database = await openDatabase();
  let expired = false;
  let result: CadRecoveryRecord | null = null;
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const record = (await requestResult(
      transaction.objectStore(STORE_NAME).get(cadRecoveryScopeKey(scope)),
    )) as CadRecoveryRecord | undefined;
    if (!record) return null;
    if (
      !Number.isFinite(record.savedAtMs) ||
      Date.now() - record.savedAtMs > MAX_RECOVERY_AGE_MS
    ) {
      expired = true;
    } else {
      result = record;
    }
  } finally {
    database.close();
  }
  if (expired) await clearCadRecovery(scope);
  return result;
}

export async function clearCadRecovery(scope: CadRecoveryScope): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    await requestResult(
      transaction.objectStore(STORE_NAME).delete(cadRecoveryScopeKey(scope)),
    );
  } finally {
    database.close();
  }
}
