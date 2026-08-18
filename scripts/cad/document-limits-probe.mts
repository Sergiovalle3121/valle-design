/**
 * Sonda del presupuesto de documento — se ejecuta DENTRO de un Chromium real.
 *
 * POR QUÉ EN EL NAVEGADOR Y NO EN NODE. Los dos benchmarks que ya existen
 * (`cad-corpus-benchmark`, `cad-plan-benchmark`) miden trabajo de CPU en Node,
 * y son honestos diciéndolo. Pero la promesa que aquí se presupuesta —«tu
 * trabajo no se pierde»— no se cumple en Node: se cumple en `CompressionStream`,
 * en IndexedDB y en el montón de JavaScript de una pestaña. Un número de Node
 * sobre gzip no dice nada del gzip que de verdad va a correr, y el coste de
 * IndexedDB no se puede simular sin IndexedDB.
 *
 * QUÉ SE MIDE, por tamaño de plano y con las FUNCIONES REALES del producto:
 *
 *   · `serializeCadDocument` → cuántos bytes ocupa el documento canónico.
 *   · `gzipCadDocumentJson`  → cuántos viajan por la ruta de archivo, que es
 *     la que se usa por encima de 1 MB.
 *   · `encodeCadRecoveryPayload` / `decodeCadRecoveryPayload` → el checkpoint
 *     local, con su verificación de hash incluida. Es la única copia del
 *     trabajo mientras no hay red.
 *   · escritura y lectura de ese mismo `Blob` en IndexedDB, que es donde
 *     acaba y de donde se rescata tras un cierre forzado.
 *   · `migrateCadDocument` sobre el JSON recuperado: lo que cuesta volver a
 *     abrir el borrador rescatado.
 *   · montón de JavaScript usado, para saber cuándo el navegador se rinde.
 *
 * QUÉ NO SE MIDE, dicho aquí antes que en ningún otro sitio: no hay render, ni
 * GPU, ni cuadros por segundo (eso es `browser-slo-100k.json`), ni red, ni API,
 * ni PostgreSQL. Tampoco se mide el journal completo (`saveCadRecovery`), que
 * añade su cola, su poda y su worker: aquí se paga el coste del payload, que
 * es el que crece con el plano.
 */
import { migrateCadDocument, serializeCadDocument } from "@/lib/cad/cad-document";
import { createCadCorpusMix } from "@/lib/cad/benchmark/corpus-mixes";
import {
  decodeCadRecoveryPayload,
  encodeCadRecoveryPayload,
} from "@/lib/cad/cad-recovery-codec";
import {
  MAX_CHECKPOINTS_PER_LANE,
  MAX_GLOBAL_CHECKPOINTS,
  MAX_RECOVERY_AGE_MS,
} from "@/lib/cad/cad-recovery-journal";
import { gzipCadDocumentJson } from "@/lib/cad/large-document-transport";
import { CAD_DOCUMENT_ARCHIVE_THRESHOLD_BYTES } from "@/components/cad/document-lifecycle/controller";

export interface DocumentLimitsSample {
  entities: number;
  buildMs: number;
  serializeMs: number;
  documentBytes: number;
  gzipMs: number;
  archiveBytes: number;
  checkpointEncodeMs: number;
  checkpointBytes: number;
  checkpointFormat: string;
  checkpointDecodeMs: number;
  indexedDbWriteMs: number;
  indexedDbReadMs: number;
  reopenMs: number;
  heapUsedBytes: number | null;
  heapLimitBytes: number | null;
}

export interface DocumentLimitsConstants {
  archiveThresholdBytes: number;
  maxCheckpointsPerLane: number;
  maxGlobalCheckpoints: number;
  maxRecoveryAgeMs: number;
  storageQuotaBytes: number | null;
  storageUsageBytes: number | null;
}

const DATABASE = "valle-document-limits";
const STORE = "payloads";

const now = () => performance.now();

/** Montón de JS: sólo Chromium lo expone, y sólo con memoria precisa. */
function heap(): { used: number | null; limit: number | null } {
  const memory = (
    performance as unknown as {
      memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
    }
  ).memory;
  return memory
    ? { used: memory.usedJSHeapSize, limit: memory.jsHeapSizeLimit }
    : { used: null, limit: null };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE))
        database.createObjectStore(STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb"));
  });
}

/**
 * Escritura y lectura reales, con la transacción CONFIRMADA antes de parar el
 * cronómetro. Medir sólo hasta `onsuccess` de la petición contaría el trabajo
 * a medias: lo que salva el trabajo de una pestaña que se estrella es el
 * `complete` de la transacción, no el acuse de la escritura.
 */
async function roundTripIndexedDb(
  database: IDBDatabase,
  key: string,
  payload: Blob,
): Promise<{ writeMs: number; readMs: number; storedBytes: number }> {
  const writeStarted = now();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("write"));
    transaction.onabort = () => reject(transaction.error ?? new Error("abort"));
    transaction.objectStore(STORE).put({ key, payload });
  });
  const writeMs = now() - writeStarted;

  const readStarted = now();
  const stored = await new Promise<Blob>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).get(key);
    request.onsuccess = () => resolve((request.result as { payload: Blob }).payload);
    request.onerror = () => reject(request.error ?? new Error("read"));
  });
  const bytes = await stored.arrayBuffer();
  const readMs = now() - readStarted;
  return { writeMs, readMs, storedBytes: bytes.byteLength };
}

/** Constantes que el producto declara hoy. Se publican tal cual, sin copiar. */
export async function documentLimitsConstants(): Promise<DocumentLimitsConstants> {
  let quota: number | null = null;
  let usage: number | null = null;
  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    quota = estimate.quota ?? null;
    usage = estimate.usage ?? null;
  }
  return {
    archiveThresholdBytes: CAD_DOCUMENT_ARCHIVE_THRESHOLD_BYTES,
    maxCheckpointsPerLane: MAX_CHECKPOINTS_PER_LANE,
    maxGlobalCheckpoints: MAX_GLOBAL_CHECKPOINTS,
    maxRecoveryAgeMs: MAX_RECOVERY_AGE_MS,
    storageQuotaBytes: quota,
    storageUsageBytes: usage,
  };
}

/**
 * Una pasada completa para un tamaño de plano.
 *
 * El corpus es `plano-real`: la mezcla que un despacho mexicano dibuja de
 * verdad (muros por caras, cadenas de cotas, hatch de acabados, rótulos y
 * bloques repetidos), no arcos sueltos elegidos para que el número salga
 * bonito. Es el mismo corpus que sostiene `cad-plan-benchmark-20k.json`.
 */
export async function measureDocumentLimits(
  entities: number,
  seed: number,
): Promise<DocumentLimitsSample> {
  const buildStarted = now();
  const corpus = createCadCorpusMix({ mix: "plano-real", entities, seed });
  const buildMs = now() - buildStarted;

  const serializeStarted = now();
  const json = serializeCadDocument(corpus.document);
  const serializeMs = now() - serializeStarted;
  const documentBytes = new TextEncoder().encode(json).byteLength;

  const gzipStarted = now();
  const archive = await gzipCadDocumentJson(json);
  const gzipMs = now() - gzipStarted;

  const encodeStarted = now();
  const encoded = await encodeCadRecoveryPayload(corpus.document);
  const checkpointEncodeMs = now() - encodeStarted;

  // El mismo `Blob` que escribe `saveCadRecovery`, con su mismo tipo MIME: si
  // aquí se guardase un `ArrayBuffer` pelado se estaría midiendo otra cosa.
  const payload = new Blob([encoded.buffer], {
    type: encoded.format === "gzip-json" ? "application/gzip" : "application/json",
  });
  const database = await openDatabase();
  const stored = await roundTripIndexedDb(
    database,
    `plano-real-${entities}-${seed}`,
    payload,
  );
  database.close();

  const decodeStarted = now();
  const restored = await decodeCadRecoveryPayload(
    encoded.format,
    await payload.arrayBuffer(),
    encoded.sha256,
  );
  const checkpointDecodeMs = now() - decodeStarted;

  const reopenStarted = now();
  const reopened = migrateCadDocument(restored);
  const reopenMs = now() - reopenStarted;
  if (reopened.entities.length !== corpus.document.entities.length)
    throw new Error(
      `el borrador recuperado perdió entidades: ${reopened.entities.length} de ${corpus.document.entities.length}`,
    );

  const memory = heap();
  return {
    entities,
    buildMs,
    serializeMs,
    documentBytes,
    gzipMs,
    archiveBytes: archive.size,
    checkpointEncodeMs,
    checkpointBytes: stored.storedBytes,
    checkpointFormat: encoded.format,
    checkpointDecodeMs,
    indexedDbWriteMs: stored.writeMs,
    indexedDbReadMs: stored.readMs,
    reopenMs,
    heapUsedBytes: memory.used,
    heapLimitBytes: memory.limit,
  };
}

declare global {
  interface Window {
    __valleDocumentLimits: {
      constants: typeof documentLimitsConstants;
      measure: typeof measureDocumentLimits;
    };
  }
}

window.__valleDocumentLimits = {
  constants: documentLimitsConstants,
  measure: measureDocumentLimits,
};
