/**
 * MODO DEMOSTRACIÓN — el puerto de documentos sin red.
 *
 * El spike de la campaña de sitio (bitácora CAMPANA_SITIO_20260829, OLA 2)
 * encontró que el editor entero toca la red en exactamente tres puntos, los
 * tres dentro del `DocumentLifecyclePort` que recibe su controlador de ciclo
 * de vida. Este puerto los sustituye: `open` entrega el documento de arranque
 * (o lo que el visitante dejó a medias), `saveContent` guarda en memoria y en
 * localStorage con versión monotónica. El autosave, la recuperación y el
 * historial del editor funcionan tal cual — creen estar hablando con la nube.
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
import type { CadDocument } from "@/lib/cad/cad-document";
import { buildCadTemplateDocument } from "@/lib/cad/template-document";

export { DEMO_DOCUMENT_ID, DEMO_STORAGE_KEY } from "@/lib/cad/demo/demo-constants";
import { DEMO_STORAGE_KEY } from "@/lib/cad/demo/demo-constants";

interface StoredDemo {
  version: number;
  document: CadDocument;
}

function readStored(storage: Pick<Storage, "getItem">): StoredDemo | null {
  try {
    const raw = storage.getItem(DEMO_STORAGE_KEY);
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

/** El documento con el que arranca la demostración. */
export function buildDemoDocument(): CadDocument {
  const built = buildCadTemplateDocument("casa-habitacion");
  return {
    ...built.document,
    paperSpaces: built.document.paperSpaces.map((space, index) =>
      index === 0
        ? {
            ...space,
            titleBlock: {
              ...space.titleBlock,
              attributes: {
                ...space.titleBlock?.attributes,
                PROJECT: "Demostración · Valle Design",
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

export function createDemoDocumentPort(
  storage:
    Pick<Storage, "getItem" | "setItem"> | undefined = globalThis.localStorage,
): DocumentLifecyclePort {
  let state: StoredDemo | null = null;

  const persist = () => {
    if (!state) return;
    try {
      storage?.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // localStorage lleno o bloqueado: la demo sigue en memoria. El banner ya
      // avisa de que aquí no hay nube; perder el respaldo local no es un error
      // que deba interrumpir el dibujo.
    }
  };

  return {
    async open(): Promise<DocumentLifecycleResource> {
      state = (storage && readStored(storage)) ?? {
        version: 1,
        document: buildDemoDocument(),
      };
      return {
        cadDocument: state.document,
        cadDocumentVersion: state.version,
      };
    },
    async saveContent(_id, document, expectedVersion) {
      const version = expectedVersion + 1;
      state = { version, document };
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
        state = { version, document: JSON.parse(json) as CadDocument };
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
