import type { CadDocument } from './cad-document';
import {
  decodeCadRecoveryOffThread,
  encodeCadRecoveryOffThread,
} from './cad-recovery-worker-client';
import type { CadRecoveryPayloadFormat } from './cad-recovery-codec';
import {
  LEGACY_LANE,
  MAX_RECOVERY_AGE_MS,
  orderCadRecoveryCandidates,
  planCadRecoveryLaneClear,
  planCadRecoveryLaneDiscard,
  planCadRecoveryPrune,
} from './cad-recovery-journal';

const DATABASE_NAME = 'cad-recovery';
const LEGACY_STORE_NAME = 'checkpoints';
const JOURNAL_STORE_NAME = 'journal';
const DATABASE_VERSION = 2;
const LANE_STORAGE_KEY = 'valle_cad_recovery_lane';

/**
 * Identificador del CARRIL de esta pestaña.
 *
 * Vive en `sessionStorage` a propósito: es el único almacén con el alcance
 * correcto —una pestaña, sobreviviendo a recargas y a la restauración tras un
 * cierre inesperado, sin compartirse con las demás—, que es exactamente la vida
 * de un borrador de recuperación. En `localStorage` todas las pestañas
 * compartirían carril y no habría arreglado nada.
 */
export function cadRecoveryLaneId(): string {
  if (typeof sessionStorage === 'undefined') return LEGACY_LANE;
  try {
    const existing = sessionStorage.getItem(LANE_STORAGE_KEY);
    if (existing) return existing;
    const lane =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `lane-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    sessionStorage.setItem(LANE_STORAGE_KEY, lane);
    return lane;
  } catch {
    // Sin almacenamiento de sesión no hay carril estable; el anónimo mantiene
    // el comportamiento anterior en vez de dejar sin recovery a la pestaña.
    return LEGACY_LANE;
  }
}

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
  /** Pestaña que lo escribió; ausente en los registros previos a los carriles. */
  lane?: string;
  /**
   * Generación de edición capturada. Es lo que permite saber si el contenido de
   * este checkpoint ya llegó al servidor; ausente en registros anteriores.
   */
  editGeneration?: number;
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
  lane?: string;
  editGeneration?: number;
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

/**
 * T-75(c): `indexedDB.open` con una versión más nueva no dispara NI
 * `onsuccess` NI `onerror` mientras otra pestaña tenga abierta una conexión
 * a la versión anterior — dispara `onblocked`, y sin manejarlo la promesa se
 * queda sin resolver PARA SIEMPRE. Como `saveCadRecovery` se llama desde una
 * cola de fondo (`createCadCheckpointQueue`) sin que nadie espere el
 * resultado, el efecto medido era: el checkpoint deja de escribirse y nada
 * lo dice — el recovery se cuelga en silencio. Rechazar aquí convierte ese
 * cuelgue mudo en un error con nombre que el llamador YA sabe mostrar (el
 * `onError` de la cola de checkpoint ya cae al aviso genérico para
 * cualquier error que no sea `CadRecoveryQuotaError`).
 */
export class CadRecoveryBlockedError extends Error {
  constructor() {
    super(
      'La recuperación local está bloqueada porque otra pestaña de Valle Design tiene una versión distinta abierta. Cierra las demás pestañas y recarga ésta.',
    );
    this.name = 'CadRecoveryBlockedError';
  }
}

const SCOPE_KEY_PREFIX = 'cad-recovery-v1';
/** Prefijo + tenant, usuario, edificio, proyecto, modelo y revisión. */
const SCOPE_KEY_PARTS = 7;

function part(value: string | null | undefined): string {
  return encodeURIComponent((value ?? '-').trim() || '-');
}

export function cadRecoveryScopeKey(scope: CadRecoveryScope): string {
  return [
    SCOPE_KEY_PREFIX,
    part(scope.tenantId),
    part(scope.userId),
    part(scope.buildingId),
    part(scope.projectId),
    part(scope.model),
    part(scope.revision),
  ].join(':');
}

/** Lo que identifica un documento SIN su espacio de trabajo (edificio/proyecto). */
export type CadRecoveryDocumentScope = Pick<
  CadRecoveryScope,
  'tenantId' | 'userId' | 'model' | 'revision'
>;

/**
 * ¿Pertenece esta clave de ámbito a ESTE documento, bajo cualquier
 * edificio/proyecto?
 *
 * Revisión de T-75(b): el editor escribe sus checkpoints con el `projectId`
 * del documento en la clave, pero la pantalla de «no pudimos cargar el
 * documento» no puede conocer ese `projectId` —es justo lo que el servidor
 * no devolvió—, así que su búsqueda por clave exacta nunca coincidía y el
 * botón siempre decía «no hay ningún punto de recuperación». Comparar por
 * partes es seguro porque `part()` percent-codifica los dos puntos: la
 * clave se parte siempre en exactamente siete trozos.
 */
export function matchesCadRecoveryDocument(
  scopeKey: string,
  scope: CadRecoveryDocumentScope,
): boolean {
  const parts = scopeKey.split(':');
  return (
    parts.length === SCOPE_KEY_PARTS &&
    parts[0] === SCOPE_KEY_PREFIX &&
    parts[1] === part(scope.tenantId) &&
    parts[2] === part(scope.userId) &&
    parts[5] === part(scope.model) &&
    parts[6] === part(scope.revision)
  );
}

/**
 * Justo lo que `openDatabase` toca de un `IDBOpenDBRequest`, aislado para
 * poder construir uno de mentira en la prueba: Node no tiene `indexedDB` y
 * este repo no trae un polyfill, así que una prueba que exigiera el objeto
 * real del DOM no podría correr en la suite `tsx`. Con esta forma mínima,
 * `openDatabaseRequestSettled` se prueba con un objeto de cuatro campos que
 * simula el `onblocked` que Node no puede disparar de verdad.
 */
export interface OpenDatabaseRequestLike {
  result: IDBDatabase;
  error: DOMException | null;
  onupgradeneeded: (() => void) | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onblocked: (() => void) | null;
}

/**
 * Cablea la promesa alrededor de un `IDBOpenDBRequest` (o de su forma
 * mínima, en la prueba). T-75(c): sin `onblocked`, un `indexedDB.open` con
 * versión nueva NO dispara ni `onsuccess` ni `onerror` mientras otra
 * pestaña tenga abierta la versión anterior — la promesa no se asienta
 * NUNCA, y como `saveCadRecovery` se llama desde una cola de fondo sin que
 * nadie la espere, el efecto medido era: el checkpoint deja de escribirse y
 * nada lo dice. Rechazar aquí convierte ese cuelgue mudo en un error con
 * nombre que el llamador YA sabe mostrar (el `onError` de la cola de
 * checkpoint cae al aviso genérico para cualquier error que no sea
 * `CadRecoveryQuotaError`).
 */
export function openDatabaseRequestSettled(
  request: OpenDatabaseRequestLike,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
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
    // Sin desconectar nada tras el rechazo: si la otra pestaña cierra más
    // tarde, `onsuccess` puede seguir llegando, y resolver/rechazar una
    // promesa ya asentada es un no-op seguro.
    request.onblocked = () => reject(new CadRecoveryBlockedError());
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined')
    return Promise.reject(new Error('IndexedDB no está disponible.'));
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  // El `IDBOpenDBRequest` real trae `this` y el tipo de evento exactos de
  // cada manejador; `OpenDatabaseRequestLike` sólo declara la forma mínima
  // que este módulo consume (ver su comentario), así que el molde no calza
  // sin aplanar esos dos tipos — la conversión es segura porque los cuatro
  // campos que se usan (`result`, `error`, los tres `on*` y `onblocked`)
  // existen tal cual en el objeto real.
  return openDatabaseRequestSettled(request as unknown as OpenDatabaseRequestLike);
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
  await deleteJournalKeys(
    database,
    planCadRecoveryPrune(records, { now: Date.now(), aggressive }),
  );
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

export interface SaveCadRecoveryOptions {
  /**
   * Instante que se estampa como `savedAtMs` en lugar del reloj de la
   * escritura. Revisión de T-72(h): el registro de emergencia que escribe la
   * frontera de error lleva el ÚLTIMO documento que viajó al servidor, y si
   * se estampara con la hora de la caída quedaría por delante —todo el orden
   * del diario es por `savedAtMs`— de un checkpoint posterior con ediciones
   * sin guardar, que es justo el que hay que ofrecer. Con la hora del
   * guardado que capturó, ese checkpoint sigue siendo el primero y el de
   * emergencia sólo sale cuando el carril no tenía nada más nuevo.
   */
  savedAtMs?: number;
}

/**
 * Sello y secuencia de un registro nuevo dentro de su carril. Puro para
 * poder probarse sin IndexedDB, como las decisiones de `cad-recovery-journal`.
 *
 * La secuencia avanza dentro del CARRIL. Contarla sobre el ámbito entero
 * hacía que dos pestañas leyesen el mismo máximo y calculasen el mismo
 * número, dejando un journal cuya numeración no describe ninguna historia. Y
 * se toma el MÁXIMO del carril, no el del registro más reciente por reloj:
 * con un sello anterior al último checkpoint (ver `savedAtMs` arriba) ambos
 * dejan de coincidir.
 */
export function stampCadRecoveryEntry(
  existing: readonly Pick<StoredCadRecoveryRecord, 'lane' | 'journalSequence'>[],
  scopeKey: string,
  lane: string,
  options: SaveCadRecoveryOptions = {},
  now = Date.now(),
): Pick<StoredCadRecoveryRecord, 'key' | 'savedAtMs' | 'journalSequence'> {
  const savedAtMs =
    options.savedAtMs !== undefined && Number.isFinite(options.savedAtMs)
      ? options.savedAtMs
      : now;
  const journalSequence =
    existing
      .filter((record) => (record.lane || LEGACY_LANE) === lane)
      .reduce((max, record) => Math.max(max, record.journalSequence), 0) + 1;
  return {
    key: `${scopeKey}:l:${lane}:j:${String(journalSequence).padStart(8, '0')}:${savedAtMs}`,
    savedAtMs,
    journalSequence,
  };
}

export async function saveCadRecovery(
  scope: CadRecoveryScope,
  document: CadDocument,
  baseCadDocumentVersion: number,
  editGeneration = 0,
  options: SaveCadRecoveryOptions = {},
): Promise<CadRecoveryRecord> {
  const encoded = await encodeCadRecoveryOffThread(document);
  const database = await openDatabase();
  const scopeKey = cadRecoveryScopeKey(scope);
  try {
    if (await storageLikelyFull(encoded.storedBytes)) await pruneJournal(database, true);
    const lane = cadRecoveryLaneId();
    const existing = await scopeJournal(database, scopeKey);
    const { key, savedAtMs, journalSequence } = stampCadRecoveryEntry(
      existing,
      scopeKey,
      lane,
      options,
    );
    const stored: StoredCadRecoveryRecord = {
      key,
      scopeKey,
      lane,
      editGeneration,
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

/**
 * Primer candidato legible, en el orden recibido; los caducados y los que no
 * decodifican se borran por el camino. Compartido por las dos lecturas para
 * que la búsqueda por documento no reimplemente la verificación de hash.
 */
async function firstReadableRecord(
  database: IDBDatabase,
  records: readonly StoredCadRecoveryRecord[],
): Promise<CadRecoveryRecord | null> {
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
  return null;
}

export async function loadCadRecovery(
  scope: CadRecoveryScope,
): Promise<CadRecoveryRecord | null> {
  const database = await openDatabase();
  const scopeKey = cadRecoveryScopeKey(scope);
  try {
    const found = await firstReadableRecord(
      database,
      orderCadRecoveryCandidates(await scopeJournal(database, scopeKey), cadRecoveryLaneId()),
    );
    if (found) return found;

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

/**
 * Último borrador legible de un documento, escrito bajo CUALQUIER
 * edificio/proyecto de este tenant y usuario (ver
 * `matchesCadRecoveryDocument`). Es la lectura de la pantalla de error del
 * estudio, que no conoce el `projectId` con el que el editor escribió.
 *
 * Recorre el almacén entero a propósito: la poda lo acota a unas pocas
 * decenas de registros, y un rango sobre el índice compuesto sería
 * aritmética de claves que ninguna prueba de esta suite puede ejercitar (Node
 * no tiene IndexedDB). Sin el almacén heredado: va por clave exacta y es
 * anterior a T-75, así que no tiene nada que este camino pueda encontrar.
 */
export async function loadCadRecoveryForDocument(
  scope: CadRecoveryDocumentScope,
): Promise<CadRecoveryRecord | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(JOURNAL_STORE_NAME, 'readonly');
    const records = (await requestResult(
      transaction.objectStore(JOURNAL_STORE_NAME).getAll(),
    ) as StoredCadRecoveryRecord[]).filter((record) =>
      matchesCadRecoveryDocument(record.scopeKey, scope),
    );
    return await firstReadableRecord(
      database,
      orderCadRecoveryCandidates(records, cadRecoveryLaneId()),
    );
  } finally {
    database.close();
  }
}

/**
 * Borra, DENTRO DE UN CARRIL, los checkpoints hasta la generación indicada.
 *
 * Sustituye al borrado por ámbito. Ese borraba todos los carriles, así que un
 * guardado en una pestaña destruía los checkpoints de las demás — pestañas que
 * ni habían guardado y cuyo trabajo sólo existía ahí.
 *
 * El corte es por GENERACIÓN, no por reloj: un checkpoint que se confirmó
 * después del guardado pero capturó una edición posterior sobrevive, porque su
 * contenido todavía no está en el servidor.
 */
export async function clearCadRecoveryLaneThrough(
  scope: CadRecoveryScope,
  lane: string,
  throughGeneration: number,
  sinceMs = 0,
): Promise<void> {
  const database = await openDatabase();
  const scopeKey = cadRecoveryScopeKey(scope);
  try {
    await deleteJournalKeys(
      database,
      planCadRecoveryLaneClear(
        await scopeJournal(database, scopeKey),
        scopeKey,
        lane,
        throughGeneration,
        sinceMs,
      ),
    );
  } finally {
    database.close();
  }
}

/**
 * Descarte explícito: borra el borrador rechazado y los anteriores de SU
 * carril. Corta por reloj, que es lo que la persona ve — «este y los de antes».
 *
 * Arrastra también el registro del almacén HEREDADO. Ese almacén guarda como
 * mucho un borrador por ámbito y es anterior a los carriles, así que siempre es
 * más viejo que lo que se está descartando; si no se borrara aquí no lo borraría
 * nadie, y un borrador heredado se reofrecería para siempre.
 */
export async function discardCadRecoveryThrough(
  scope: CadRecoveryScope,
  lane: string,
  throughSavedAtMs: number,
): Promise<void> {
  const database = await openDatabase();
  const scopeKey = cadRecoveryScopeKey(scope);
  try {
    await deleteJournalKeys(
      database,
      planCadRecoveryLaneDiscard(
        await scopeJournal(database, scopeKey),
        scopeKey,
        lane,
        throughSavedAtMs,
      ),
    );
    const transaction = database.transaction(LEGACY_STORE_NAME, 'readwrite');
    transaction.objectStore(LEGACY_STORE_NAME).delete(scopeKey);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}
