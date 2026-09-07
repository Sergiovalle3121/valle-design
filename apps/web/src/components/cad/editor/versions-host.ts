/**
 * EL CONTROLADOR DE VERSIONES (F1 · paso 2 del plan de extracción).
 *
 * Dueño del estado del cuadro «Versiones» —abierto, nombre tecleado, ocupado,
 * la lista de versiones del servidor— y de los snapshots locales de sesión
 * con su última comparación. Mismo patrón que `export-host.ts` y
 * `palettes/paper-spaces-host.ts`: clase + `useSyncExternalStore`, setters con
 * la firma de React para que los puntos del monolito que los siguen llamando
 * (`recordLocalSnapshot`, el efecto de carga, el propio cuadro) no cambien ni
 * uno.
 *
 * Las acciones locales están movidas tal cual del monolito. Las de servidor
 * son nuevas (T-12·1): antes pedían `layout/snapshots…`, una ruta que el
 * adaptador declaraba «sin equivalente en /v1/cad → 404», así que la lista
 * salía siempre vacía y guardar/restaurar/borrar siempre fallaban. Hoy leen
 * el historial CAS real del documento (`/v1/cad/documents/:id/versions`, una
 * versión por cada guardado, inmutable) y «restaurar» guarda el documento de
 * esa versión como versión NUEVA con el CAS de siempre: nada se borra, y si el
 * servidor avanzó mientras tanto el 409 se dice, no se disimula.
 *
 * ## Las acciones NO llaman a ningún hook, a propósito
 *
 * `useCadVersionsActions` devuelve cierres planos que el editor vuelve a crear
 * en cada render, exactamente como hacía cuando eran `const` dentro de la
 * función del componente: leen `versName` y `localSnapshots` de ESE render
 * (el objeto que `useCadVersions` devolvió) y nada más. No invoca `useState`,
 * `useMemo` ni ningún otro hook, así que no registra nada en React y el
 * orden de hooks del editor no cambia. Lleva prefijo `use` por la misma
 * decisión que `useCadExportActions` (D-06): aquí no recibe refs, así que
 * `react-hooks/refs` no la marcaría, pero el prefijo hace que el compilador
 * de React —si algún día se enciende— la ejecute en cada render y nunca la
 * memoice, que es exactamente la semántica que hace verbatim la extracción.
 * Si el trinquete baja y se decide renombrar, es un cambio de un identificador.
 */
import {
  useMemo,
  useSyncExternalStore,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type {
  CadDocumentInline,
  CadDocumentVersionDetail,
  CadDocumentVersionSummary,
} from "@valle/design-sdk";
import type { CadServerVersion } from "../dialogs/CadVersionsDialog";
import type { CadEditorNotifier } from "./export-scene-actions";
import { peekLegacyDocumentId } from "@/lib/cad/legacy/layout-document-identity";
import {
  createCadSnapshot,
  diffCadSnapshots,
  restoreCadSnapshot,
  type CadSnapshotDiff,
  type CadSnapshotHistory,
} from "@/lib/cad/snapshots";

type Updater<T> = T | ((previous: T) => T);

/**
 * La firma de un setter de React, calcada: dos sobrecargas para que el
 * parámetro de la función actualizadora INFIERA su tipo en el sitio de
 * llamada (`setX(current => …)`).
 */
interface CadStateSetter<T> {
  (value: T): void;
  (updater: (previous: T) => T): void;
}

function resolve<T>(value: Updater<T>, previous: T): T {
  return typeof value === "function"
    ? (value as (previous: T) => T)(previous)
    : value;
}

export type { CadServerVersion };

/**
 * Lo que el anfitrión necesita del servidor, y nada más: la lista, una versión
 * hidratada, y guardar-como-nueva. `versionsRepository` lo cumple tal cual; un
 * spec lo sustituye por un doble sin red.
 */
export interface CadVersionsApi {
  list: (documentId: string) => Promise<{ items: CadDocumentVersionSummary[] }>;
  get: (documentId: string, version: number) => Promise<CadDocumentVersionDetail>;
  restoreAs: (
    documentId: string,
    cadDocument: CadDocumentInline,
    expectedCadDocumentVersion: number,
  ) => Promise<unknown>;
}

/** El puntero a blob no trae entidades; la versión hidratada (R3) sí. */
function inlineDocumentOf(
  detail: CadDocumentVersionDetail,
): CadDocumentInline | null {
  const envelope = detail.cadDocument as unknown as {
    _storage?: { kind?: string };
    entities?: unknown;
  };
  if (!envelope || envelope._storage?.kind === "document_blob") return null;
  return Array.isArray(envelope.entities)
    ? (detail.cadDocument as CadDocumentInline)
    : null;
}

/** El motivo de un snapshot local; el mismo que `CadLayoutSnapshot["reason"]`. */
export type CadLocalSnapshotReason = "manual" | "command" | "import" | "restore";

export interface CadVersionsSnapshot<S> {
  /** El cuadro «Versiones» está abierto. */
  showVersions: boolean;
  /** Los puntos de restauración que no salen del navegador (tope 20). */
  localSnapshots: CadSnapshotHistory<S>;
  /** La última comparación contra un snapshot local, o ninguna. */
  snapshotDiff: CadSnapshotDiff | null;
  /** Las versiones que viven en el servidor para este modelo y revisión. */
  versions: CadServerVersion[];
  /** El nombre tecleado en el cuadro para la próxima versión o snapshot. */
  versName: string;
  /** Hay una petición de guardar o restaurar versión en vuelo. */
  versBusy: boolean;
}

export class CadVersionsHost<S> {
  private snapshot: CadVersionsSnapshot<S> = {
    showVersions: false,
    localSnapshots: { snapshots: [] },
    snapshotDiff: null,
    versions: [],
    versName: "",
    versBusy: false,
  };
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Estable por identidad: `useSyncExternalStore` compara así. */
  getSnapshot = (): CadVersionsSnapshot<S> => this.snapshot;

  /**
   * Como `useState`: si ningún valor cambia (`Object.is`), no hay instantánea
   * nueva ni aviso a los suscriptores — el editor no vuelve a pintar por un
   * `setSnapshotDiff(null)` que ya era `null`, igual que antes de la mudanza.
   */
  private patch(next: Partial<CadVersionsSnapshot<S>>): void {
    const keys = Object.keys(next) as (keyof CadVersionsSnapshot<S>)[];
    if (keys.every((key) => Object.is(next[key], this.snapshot[key]))) return;
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  setShowVersions: CadStateSetter<boolean> = (
    value: Updater<boolean>,
  ): void => {
    this.patch({ showVersions: resolve(value, this.snapshot.showVersions) });
  };

  setLocalSnapshots: CadStateSetter<CadSnapshotHistory<S>> = (
    value: Updater<CadSnapshotHistory<S>>,
  ): void => {
    this.patch({
      localSnapshots: resolve(value, this.snapshot.localSnapshots),
    });
  };

  setSnapshotDiff: CadStateSetter<CadSnapshotDiff | null> = (
    value: Updater<CadSnapshotDiff | null>,
  ): void => {
    this.patch({ snapshotDiff: resolve(value, this.snapshot.snapshotDiff) });
  };

  setVersions: CadStateSetter<CadServerVersion[]> = (
    value: Updater<CadServerVersion[]>,
  ): void => {
    this.patch({ versions: resolve(value, this.snapshot.versions) });
  };

  setVersName: CadStateSetter<string> = (value: Updater<string>): void => {
    this.patch({ versName: resolve(value, this.snapshot.versName) });
  };

  setVersBusy: CadStateSetter<boolean> = (value: Updater<boolean>): void => {
    this.patch({ versBusy: resolve(value, this.snapshot.versBusy) });
  };
}

/**
 * Un anfitrión por montaje del editor (misma vida que el resto de hosts). El
 * parámetro de tipo es el `Snapshot` privado del monolito: así
 * `localSnapshots` conserva su `CadSnapshotHistory<Snapshot>` sin exportarlo.
 */
export function useCadVersionsHost<S>(): CadVersionsHost<S> {
  return useMemo(() => new CadVersionsHost<S>(), []);
}

/** El estado vivo, suscrito. El editor lo desestructura con sus nombres de siempre. */
export function useCadVersions<S>(
  host: CadVersionsHost<S>,
): CadVersionsSnapshot<S> {
  return useSyncExternalStore(host.subscribe, host.getSnapshot, host.getSnapshot);
}

export interface CadVersionsInputs<S> {
  // Estado del RENDER en curso: los cierres leen exactamente lo que leían.
  drawingReadOnly: boolean;
  versionsState: Pick<CadVersionsSnapshot<S>, "versName" | "localSnapshots">;
  // Setter que sigue siendo del monolito: `reloadTick` alimenta su efecto de carga.
  setReloadTick: Dispatch<SetStateAction<number>>;
  // Props del editor: `documentId` es el alcance de `/studio/[documentId]`
  // (ausente en el estudio heredado, que resuelve la identidad por model+revision).
  model: string;
  revision: string;
  documentId: string | undefined;
  /**
   * Las refs del monolito que las acciones leen EN EL EVENTO, nunca en render:
   * la identidad resuelta por el adaptador, el layout cargado (con la versión
   * CAS que el editor cree cabeza) y si hay cambios sin mandar.
   */
  refs: {
    documentId: RefObject<string | undefined>;
    data: RefObject<{ cadDocumentVersion?: number } | null>;
    dirty: RefObject<boolean>;
  };
  /** El historial del servidor; por defecto `versionsRepository` (cargado perezoso). */
  api?: CadVersionsApi;
  // Devoluciones de llamada del editor (todas `useCallback` en el monolito).
  snapshot: () => S;
  restore: (s: S) => void;
  pushHistory: () => void;
  recordLocalSnapshot: (label: string, reason: CadLocalSnapshotReason) => string;
  toast: CadEditorNotifier;
}

export interface CadVersionsActions {
  /** El dibujo tiene identidad en el servidor: hay historial que leer. */
  servidorConocido: boolean;
  openVersions: () => void;
  saveLocalSnapshot: (reason?: CadLocalSnapshotReason) => void;
  restoreLocalSnapshot: (id: string) => void;
  compareLocalSnapshot: (id: string) => void;
  deleteLocalSnapshot: (id: string) => void;
  restoreVersion: (version: number) => Promise<void>;
}

/**
 * Las acciones del editor, con los cuerpos movidos tal cual del monolito; lo
 * único que cambia es de dónde salen los identificadores del cierre. No
 * invoca ningún hook (ver la cabecera del fichero sobre el prefijo `use`).
 */
export function createCadVersionsActions<S>(
  host: CadVersionsHost<S>,
  inputs: CadVersionsInputs<S>,
): CadVersionsActions {
  const {
    drawingReadOnly,
    versionsState,
    setReloadTick,
    model,
    revision,
    refs,
    api: apiInput,
    snapshot,
    restore,
    pushHistory,
    recordLocalSnapshot,
    toast,
  } = inputs;
  const { versName, localSnapshots } = versionsState;
  const {
    setShowVersions,
    setLocalSnapshots,
    setSnapshotDiff,
    setVersions,
    setVersName,
    setVersBusy,
  } = host;
  // ---- el historial del servidor (T-12·1) ----
  const documentId = () =>
    refs.documentId.current ?? peekLegacyDocumentId(model, revision);
  const serverVersion = () => refs.data.current?.cadDocumentVersion ?? null;
  const hasUnsavedChanges = () => refs.dirty.current === true;
  const api = async (): Promise<CadVersionsApi> =>
    apiInput ??
    (await import("@/lib/cad/repositories/versions")).versionsRepository;
  const loadVersions = async () => {
    const id = documentId();
    if (!id) {
      setVersions([]);
      return;
    }
    try {
      const page = await (await api()).list(id);
      setVersions(
        [...page.items]
          .sort((a, b) => b.version - a.version)
          .map((item) => ({
            version: item.version,
            createdAt: item.createdAt,
            createdBy: item.createdBy ?? null,
            sha256: item.sha256 ?? null,
          })),
      );
    } catch {
      toast.error(
        "No se pudo leer el historial del servidor; la lista puede estar incompleta.",
        "Versiones",
      );
    }
  };
  const openVersions = () => {
    setShowVersions(true);
    void loadVersions();
  };

  const saveLocalSnapshot = (
    reason: "manual" | "command" | "import" | "restore" = "manual",
  ) => {
    const label =
      versName.trim() || `Local ${localSnapshots.snapshots.length + 1}`;
    recordLocalSnapshot(label, reason);
    setVersName("");
    toast.success("Snapshot local guardado en esta sesión.", "Snapshots CAD");
  };
  const restoreLocalSnapshot = (id: string) => {
    const restored = restoreCadSnapshot(localSnapshots, id);
    if (!restored.layout) {
      toast.error("No se encontró el snapshot local.", "Snapshots CAD");
      return;
    }
    pushHistory();
    restore(restored.layout);
    setLocalSnapshots(restored.history);
    setShowVersions(false);
    toast.success("Snapshot local restaurado.", "Snapshots CAD");
  };
  const compareLocalSnapshot = (id: string) => {
    const base = localSnapshots.snapshots.find((item) => item.id === id);
    if (!base) {
      toast.error("No se encontró el snapshot local.", "Snapshots CAD");
      return;
    }
    const current = createCadSnapshot(
      snapshot(),
      "Actual",
      "manual",
      "current",
    );
    const diff = diffCadSnapshots(base, current);
    setSnapshotDiff(diff);
    toast.success(
      diff.changed
        ? "El layout cambió desde ese snapshot."
        : "El layout coincide con ese snapshot.",
      "Snapshots CAD",
    );
  };
  const deleteLocalSnapshot = (id: string) => {
    setLocalSnapshots((history) => ({
      activeId: history.activeId === id ? undefined : history.activeId,
      snapshots: history.snapshots.filter((item) => item.id !== id),
    }));
  };
  const restoreVersion = async (version: number) => {
    if (drawingReadOnly) return;
    const id = documentId();
    if (!id) {
      toast.error(
        "Este dibujo aún no tiene identidad en el servidor: guárdalo primero.",
        "Versiones",
      );
      return;
    }
    if (hasUnsavedChanges()) {
      toast.error(
        "Hay cambios sin guardar: espera al guardado automático o pulsa Ctrl+S antes de volver a una versión.",
        "Versiones",
      );
      return;
    }
    const expected = serverVersion();
    if (expected === null) {
      toast.error(
        "El editor no sabe qué versión tiene el servidor: recarga el dibujo.",
        "Versiones",
      );
      return;
    }
    setVersBusy(true);
    try {
      const detail = await (await api()).get(id, version);
      const document = inlineDocumentOf(detail);
      if (!document) {
        toast.error(
          `La versión ${version} llegó como puntero a blob, no como documento; no se puede restaurar desde aquí.`,
          "Versiones",
        );
        return;
      }
      await (await api()).restoreAs(id, document, expected);
      toast.success(
        `El dibujo volvió a la versión ${version}; el servidor la guardó como versión nueva.`,
        "Versiones",
      );
      setShowVersions(false);
      setReloadTick((t) => t + 1); // re-run the load effect
    } catch (error) {
      const conflict =
        typeof error === "object" &&
        error !== null &&
        "isVersionConflict" in error &&
        typeof (error as { isVersionConflict: unknown }).isVersionConflict ===
          "function" &&
        (error as { isVersionConflict: () => boolean }).isVersionConflict();
      toast.error(
        conflict
          ? "El documento cambió en el servidor mientras mirabas las versiones: recarga y vuelve a intentarlo."
          : "No se pudo restaurar la versión.",
        "Versiones",
      );
    } finally {
      setVersBusy(false);
    }
  };
  return {
    servidorConocido:
      inputs.documentId !== undefined ||
      peekLegacyDocumentId(model, revision) !== null,
    openVersions,
    saveLocalSnapshot,
    restoreLocalSnapshot,
    compareLocalSnapshot,
    deleteLocalSnapshot,
    restoreVersion,
  };
}

/**
 * El nombre con prefijo `use` que llama el monolito (D-06): no invoca hooks,
 * pero recibe refs, y `react-hooks/refs` marca cualquier llamada sin prefijo
 * `use` que las reciba. Un spec llama a `createCadVersionsActions` directo.
 */
export const useCadVersionsActions = createCadVersionsActions;
