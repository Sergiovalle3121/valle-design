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
 * Los cuerpos de las acciones están movidos tal cual del monolito: mismas
 * cadenas de aviso, mismas rutas `layout/snapshots…` y mismos cuerpos de
 * petición. Que el adaptador responda hoy 404 a esas rutas es asunto de
 * T-12·1, no de esta mudanza: el botón y el cuadro siguen siendo alcanzables.
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
  type SetStateAction,
} from "react";
import type { CadVersionView } from "../dialogs/CadVersionsDialog";
import type { CadEditorNotifier } from "./export-scene-actions";
import { legacyCadFetch as legacyCadFetchDefault } from "@/lib/cad/legacy/layout-http-adapter";
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

/**
 * Una versión tal como la devuelve `layout/snapshots`: la forma exacta que el
 * monolito afirmaba al hacer el cast, más estrecha que la vista del cuadro
 * (`name` siempre viene, `createdAt` siempre es texto ISO).
 */
export interface CadServerVersion extends CadVersionView {
  name: string;
  createdAt: string;
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
  // Props del editor.
  model: string;
  revision: string;
  // Estado del RENDER en curso: los cierres leen exactamente lo que leían.
  drawingReadOnly: boolean;
  versionsState: Pick<CadVersionsSnapshot<S>, "versName" | "localSnapshots">;
  // Setter que sigue siendo del monolito: `reloadTick` alimenta su efecto de carga.
  setReloadTick: Dispatch<SetStateAction<number>>;
  // Devoluciones de llamada del editor (todas `useCallback` en el monolito).
  snapshot: () => S;
  restore: (s: S) => void;
  pushHistory: () => void;
  recordLocalSnapshot: (label: string, reason: CadLocalSnapshotReason) => string;
  toast: CadEditorNotifier;
  /** Por defecto `legacyCadFetch`; un spec puede sustituirlo para simular el 404. */
  fetch?: typeof legacyCadFetchDefault;
}

export interface CadVersionsActions {
  openVersions: () => void;
  saveLocalSnapshot: (reason?: CadLocalSnapshotReason) => void;
  restoreLocalSnapshot: (id: string) => void;
  compareLocalSnapshot: (id: string) => void;
  deleteLocalSnapshot: (id: string) => void;
  saveVersion: () => Promise<void>;
  restoreVersion: (id: string) => Promise<void>;
  deleteVersion: (id: string) => Promise<void>;
}

/**
 * Las acciones del editor, con los cuerpos movidos tal cual del monolito; lo
 * único que cambia es de dónde salen los identificadores del cierre. No
 * invoca ningún hook (ver la cabecera del fichero sobre el prefijo `use`).
 */
export function useCadVersionsActions<S>(
  host: CadVersionsHost<S>,
  inputs: CadVersionsInputs<S>,
): CadVersionsActions {
  const {
    model,
    revision,
    drawingReadOnly,
    versionsState,
    setReloadTick,
    snapshot,
    restore,
    pushHistory,
    recordLocalSnapshot,
    toast,
    fetch: legacyCadFetch = legacyCadFetchDefault,
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
  // ---- versions / scenarios (ported from 2D, unify) ----
  const scopeQs = `model=${encodeURIComponent(model)}&revision=${encodeURIComponent(revision)}`;
  const loadVersions = async () => {
    if (!model) return;
    try {
      const r = await legacyCadFetch(`layout/snapshots?${scopeQs}`);
      if (r.ok) setVersions((await r.json()) as CadServerVersion[]);
    } catch {
      /* transient */
    }
  };
  const openVersions = () => {
    setShowVersions(true);
    loadVersions();
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
  const saveVersion = async () => {
    if (!model || drawingReadOnly) return;
    setVersBusy(true);
    try {
      const r = await legacyCadFetch("layout/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          revision,
          name: versName.trim() || undefined,
        }),
      });
      if (!r.ok) {
        toast.error("No se pudo guardar la versión.", "Versiones");
        return;
      }
      setVersName("");
      toast.success("Versión guardada.", "Versiones");
      loadVersions();
    } catch {
      toast.error("Error de red.", "Versiones");
    } finally {
      setVersBusy(false);
    }
  };
  const restoreVersion = async (id: string) => {
    if (!model || drawingReadOnly) return;
    setVersBusy(true);
    try {
      const r = await legacyCadFetch(
        `layout/snapshots/${id}/restore?${scopeQs}`,
        { method: "POST" },
      );
      if (!r.ok) {
        toast.error("No se pudo restaurar la versión.", "Versiones");
        return;
      }
      toast.success("Versión restaurada.", "Versiones");
      setShowVersions(false);
      setReloadTick((t) => t + 1); // re-run the load effect
    } catch {
      toast.error("Error de red.", "Versiones");
    } finally {
      setVersBusy(false);
    }
  };
  const deleteVersion = async (id: string) => {
    if (!model || drawingReadOnly) return;
    try {
      const r = await legacyCadFetch(`layout/snapshots/${id}?${scopeQs}`, {
        method: "DELETE",
      });
      if (r.ok) setVersions((await r.json()) as CadServerVersion[]);
    } catch {
      /* transient */
    }
  };
  return {
    openVersions,
    saveLocalSnapshot,
    restoreLocalSnapshot,
    compareLocalSnapshot,
    deleteLocalSnapshot,
    saveVersion,
    restoreVersion,
    deleteVersion,
  };
}
