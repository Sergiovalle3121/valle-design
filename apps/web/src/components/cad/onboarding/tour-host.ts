"use client";

/**
 * Dónde va el recorrido guiado, fuera de React.
 *
 * Mismo patrón que `palettes/palette-host.ts` y por la misma razón exacta: el
 * estado tiene que sobrevivir a los remontajes del editor y no puede costar un
 * `useState` en `Layout3DEditor.tsx`, cuyo presupuesto sólo puede BAJAR. Aquí
 * vive el registro —arranque, final, saltado— y el componente sólo lo pinta.
 *
 * ## Por qué persiste en `localStorage` y no en el servidor
 *
 * Porque «ya vi el recorrido» es una preferencia de esta persona en este
 * navegador, no un dato del proyecto. Guardarla en el servidor exigiría una
 * operación nueva del contrato —hoy son 43— para una casilla. Y porque el modo
 * de fallo correcto cuando el almacenamiento no está (una pestaña privada, un
 * navegador con las cookies apagadas) es que el recorrido salga otra vez, no que
 * el editor no arranque.
 *
 * ## Por qué la clave lleva el usuario
 *
 * Dos arquitectos que comparten una máquina de estudio son dos primeras veces.
 * Sin el identificador, el segundo hereda el «ya lo vi» del primero y se queda
 * sin el recorrido que decide si se queda.
 */
import {
  EMPTY_CAD_TOUR_RECORD,
  cadGuidedTourReduce,
  parseCadTourRecord,
  type CadTourAction,
  type CadTourRecord,
} from "@/lib/cad/onboarding/guided-tour";

const STORAGE_PREFIX = "valle:cad:tour:v1";

export function cadTourStorageKey(userId?: string | null): string {
  return userId ? `${STORAGE_PREFIX}:${userId}` : STORAGE_PREFIX;
}

/**
 * El almacén. Una instancia por módulo: en un momento dado hay un editor
 * montado, y dos registros paralelos harían que el recorrido dijera una cosa y
 * el `localStorage` otra.
 */
class CadTourHost {
  private record: CadTourRecord = { ...EMPTY_CAD_TOUR_RECORD };
  private key = cadTourStorageKey();
  /** ¿Se ha leído ya el almacén para `key`? Distinto de «el registro es vacío». */
  private loaded = false;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** `useSyncExternalStore` compara por identidad: nunca se devuelve copia. */
  getSnapshot = (): CadTourRecord => this.record;

  /**
   * Ata el almacén a un usuario y carga lo que hubiera guardado.
   *
   * Idempotente: llamarla en cada render con el mismo id no relee ni publica.
   */
  attach = (userId?: string | null): void => {
    const key = cadTourStorageKey(userId);
    if (key === this.key && this.loaded) return;
    this.key = key;
    this.loaded = true;
    const loaded = parseCadTourRecord(readStorage(key));
    if (sameRecord(loaded, this.record)) return;
    this.record = loaded;
    this.publish();
  };

  /** Sólo para las specs: vuelve al estado de recién cargado. */
  reset = (): void => {
    this.record = { ...EMPTY_CAD_TOUR_RECORD };
    this.key = cadTourStorageKey();
    this.loaded = false;
    this.publish();
  };

  dispatch = (action: CadTourAction): void => {
    const next = cadGuidedTourReduce(this.record, action);
    if (next === this.record) return;
    this.record = next;
    writeStorage(this.key, JSON.stringify(next));
    this.publish();
  };

  private publish(): void {
    for (const listener of this.listeners) listener();
  }
}

function sameRecord(a: CadTourRecord, b: CadTourRecord): boolean {
  return (
    a.status === b.status &&
    a.startedAt === b.startedAt &&
    a.finishedAt === b.finishedAt &&
    a.acknowledged === b.acknowledged &&
    a.plotted === b.plotted
  );
}

/**
 * Leer y escribir el almacén FALLA ABIERTO.
 *
 * En una pestaña privada `localStorage` lanza al escribir. Dejar que esa
 * excepción suba tiraría el editor entero por no poder recordar una casilla, que
 * es exactamente la clase de fallo que no se puede permitir un acompañante.
 */
function readStorage(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  } catch {
    // Sin persistencia, el recorrido sigue funcionando en esta sesión.
  }
}

export const cadTourHost = new CadTourHost();

/** El anfitrión de trazado avisa por aquí de que entregó un PDF. */
export function noteCadTourPlot(now = Date.now()): void {
  cadTourHost.dispatch({ type: "plot", now });
}
