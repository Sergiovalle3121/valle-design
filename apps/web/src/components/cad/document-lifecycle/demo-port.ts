/**
 * MODO DEMOSTRACIÓN — el puerto de documentos sin red.
 *
 * El spike de la campaña de sitio (bitácora CAMPANA_SITIO_20260829, OLA 2)
 * encontró que el editor entero toca la red en exactamente tres puntos, los
 * tres dentro del `DocumentLifecyclePort` que recibe su controlador de ciclo
 * de vida. Este puerto los sustituye: cada visita abre la casa limpia y guarda
 * en memoria y localStorage con versión monotónica. Si hay un dibujo anterior,
 * se copia antes de reemplazar el autosave y se recupera sólo por elección.
 * El autosave y el historial del editor creen estar hablando con la nube.
 *
 * Qué NO hace, a propósito (y el banner del demo lo dice): nube, colaboración,
 * historial de versiones del servidor. El CAS jamás da 409 porque solo hay un
 * escritor: esta pestaña.
 *
 * El dibujo de arranque es la plantilla de casa habitación construida por el
 * MISMO conversor de la galería, con el cajetín marcando «Demostración» — el
 * PDF que el visitante exporte lo dirá en su propio cajetín, trazado por el
 * pipeline real.
 *
 * VIVE AQUÍ y no en `lib/cad/demo/` porque implementa el contrato del
 * controlador de ciclo de vida, que es de `components/` — igual que su hermano
 * `design-port.ts`. En `lib/` violaba la dirección de imports (lib nunca
 * importa de components; `check:conventions` lo caza). Las CONSTANTES sí se
 * quedan en `lib/cad/demo/demo-constants.ts`: son la hoja sin dependencias que
 * comparten este puerto, la adopción del tablero y la prueba E2E.
 */
import type {
  DocumentLifecyclePort,
  DocumentLifecycleResource,
} from "./controller";
import { serializeCadDocument, type CadDocument } from "@/lib/cad/cad-document";
import { buildCadTemplateDocument } from "@/lib/cad/template-document";
import { buildDemoVolumeDocument } from "@/lib/cad/demo/demo-volume";

export { DEMO_DOCUMENT_ID, DEMO_STORAGE_KEY } from "@/lib/cad/demo/demo-constants";
import { DEMO_RECOVERY_STORAGE_KEY, DEMO_STORAGE_KEY } from "@/lib/cad/demo/demo-constants";

interface StoredDemo {
  version: number;
  document: CadDocument;
  /** Ausente en sobres antiguos: se tratan como trabajo recuperable. */
  edited?: boolean;
}

function readStored(storage: Pick<Storage, "getItem">, key = DEMO_STORAGE_KEY): StoredDemo | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDemo;
    if (!parsed || typeof parsed.version !== "number" || !parsed.document)
      return null;
    return parsed;
  } catch {
    // Un dibujo demo ilegible no puede tumbar la demostración: se arranca de cero.
    return null;
  }
}

/**
 * El último trabajo propio manda; una casa de arranque sin ediciones no tapa
 * una recuperación anterior. Los sobres previos a `edited` son recuperables:
 * no hay forma segura de afirmar que sus objetos no los dibujó una persona.
 */
function recoverableStored(storage: Pick<Storage, "getItem">): StoredDemo | null {
  const current = readStored(storage);
  if (current && current.edited !== false) return current;
  const archived = readStored(storage, DEMO_RECOVERY_STORAGE_KEY);
  return archived && archived.edited !== false ? archived : null;
}

/**
 * Copia byte por byte antes de reemplazar un autosave. Si ya había una copia,
 * la desplaza a una clave histórica única; ninguna visita limpia debe borrar
 * lo que alguien dibujó sólo por abrir la página. Ante cuota llena se aborta
 * la sustitución del autosave viejo y el editor sigue en memoria.
 */
function preserveRaw(storage: Pick<Storage, "getItem" | "setItem">, raw: string): void {
  const previous = storage.getItem(DEMO_RECOVERY_STORAGE_KEY);
  if (previous === raw) return;
  if (previous) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    storage.setItem(`${DEMO_RECOVERY_STORAGE_KEY}:${suffix}`, previous);
  }
  storage.setItem(DEMO_RECOVERY_STORAGE_KEY, raw);
}

/** El documento con el que arranca la demostración. */
export function buildDemoDocument(): CadDocument {
  const built = buildCadTemplateDocument("casa-habitacion");
  const volumed = buildDemoVolumeDocument(built.document);
  return {
    ...volumed,
    paperSpaces: volumed.paperSpaces.map((space, index) =>
      index === 0
        ? {
            ...space,
            titleBlock: {
              ...space.titleBlock,
              attributes: {
                ...space.titleBlock?.attributes,
                // Literal: demo-port no importa @/config/brand; el host le pasa la etiqueta.
                PROJECT: "Demostración · VALLECAD",
                CLIENTE: "Demostración",
              },
            },
          }
        : space,
    ),
  };
}

/** El dibujo que el visitante dejó guardado, si existe y es legible. */
export function storedDemoDocument(
  storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage,
): CadDocument | null {
  if (!storage) return null;
  return readStored(storage)?.document ?? null;
}

/** Borra el dibujo demo (tras adoptarlo en una cuenta). */
export function clearDemoDocument(
  storage: Pick<Storage, "removeItem"> | undefined = globalThis.localStorage,
): void {
  try {
    storage?.removeItem(DEMO_STORAGE_KEY);
  } catch {
    /* sin almacenamiento no hay nada que borrar */
  }
}

/** El editor ve el puerto normal; /demo dispone además de recuperación elegida. */
export interface DemoDocumentPort extends DocumentLifecyclePort {
  readonly hasRecoverableDocument: boolean;
  restorePrevious(): boolean;
}

export function createDemoDocumentPort(
  storage:
    Pick<Storage, "getItem" | "setItem"> | undefined = globalThis.localStorage,
): DemoDocumentPort {
  const previous = storage ? recoverableStored(storage) : null;
  let state: StoredDemo | null = null;
  let initialSignature: string | null = null;
  let recovered = false;
  let restoreQueued = false;
  let priorProtected = false;

  const protectPrior = (): boolean => {
    if (!storage) return false;
    try {
      const current = readStored(storage);
      const raw = storage.getItem(DEMO_STORAGE_KEY);
      // Incluso un sobre antiguo ilegible merece conservarse intacto; aunque
      // no podamos ofrecer restaurarlo, abrir /demo no debe destruir sus bytes.
      if (raw && (!current || current.edited !== false)) preserveRaw(storage, raw);
      return true;
    } catch {
      return false;
    }
  };

  const persist = () => {
    if (!state || !storage) return;
    // Si no cupo la copia, no se pisa el único ejemplar viejo. Se reintenta
    // en el siguiente guardado; el dibujo actual permanece en memoria.
    if (!priorProtected) priorProtected = protectPrior();
    if (!priorProtected) return;
    try {
      storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // localStorage lleno o bloqueado: el editor conserva el dibujo en memoria.
    }
  };

  return {
    hasRecoverableDocument: previous !== null,
    restorePrevious() {
      if (!previous) return false;
      // Si la persona ya dibujó algo en esta visita, conservar también ese
      // trabajo antes de volver al anterior.
      priorProtected = protectPrior();
      state = { ...previous, edited: true };
      recovered = true;
      restoreQueued = true;
      if (priorProtected) persist();
      return true;
    },
    async open(): Promise<DocumentLifecycleResource> {
      if (restoreQueued) restoreQueued = false;
      else if (!state) {
        const document = buildDemoDocument();
        initialSignature = serializeCadDocument(document);
        state = { version: 1, document, edited: false };
        persist();
      }
      if (!state) throw new Error("No se pudo abrir la demostración.");
      return {
        cadDocument: state.document,
        cadDocumentVersion: state.version,
      };
    },
    async saveContent(_id, document, expectedVersion) {
      const version = expectedVersion + 1;
      state = {
        version,
        document,
        edited: recovered || initialSignature === null ||
          serializeCadDocument(document) !== initialSignature,
      };
      persist();
      return { cadDocumentVersion: version };
    },
    async saveArchive(_id, archive, expectedVersion) {
      // El controlador manda el ARCHIVO gzip EN LUGAR de saveContent cuando el
      // documento supera el umbral: aquí hay que descomprimirlo o el respaldo
      // local se quedaría con un dibujo viejo mientras la versión avanza.
      const version = expectedVersion + 1;
      try {
        const stream = archive
          .stream()
          .pipeThrough(new DecompressionStream("gzip"));
        const json = await new Response(stream).text();
        const document = JSON.parse(json) as CadDocument;
        state = {
          version,
          document,
          edited: recovered || initialSignature === null ||
            serializeCadDocument(document) !== initialSignature,
        };
      } catch {
        // Sin DecompressionStream o con un blob ilegible, al menos la versión
        // avanza y el documento en memoria del editor sigue siendo la verdad.
        state = state ? { ...state, version } : state;
      }
      persist();
      return { cadDocumentVersion: version };
    },
    versionConflict() {
      return null;
    },
  };
}
