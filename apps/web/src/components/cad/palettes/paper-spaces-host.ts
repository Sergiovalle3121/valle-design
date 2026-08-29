/**
 * EL CONTROLADOR DE ESPACIOS-PAPEL (P1-FE2a, campaña de sitio 2026-08-29).
 *
 * `DEUDA-MONOLITO.md` lo pedía con nombre: el cuadro del juego de láminas es
 * «el más grande y el que NO se debe extraer todavía» porque toca cinco
 * estados y una docena de acciones del cierre del monolito — y «un componente
 * con cuarenta props no es una extracción». Lo que hacía falta primero era un
 * dueño del ESTADO de espacios-papel fuera de la función del editor. Esto es
 * exactamente eso, con el patrón ya probado de esta carpeta (clase +
 * `useSyncExternalStore`, como `layer-manager-host` y `style-manager-host`).
 *
 * ## El contrato de los setters: idénticos a los de React, a propósito
 *
 * Los ~120 puntos del monolito que leen y escriben estos estados no cambian
 * NI UNO: los setters aceptan valor o función actualizadora, con el mismo
 * nombre que tenían (`setPaperSpaces(prev => …)` sigue compilando). La
 * extracción es de propiedad, no de sintaxis — así el diff del monolito es
 * mínimo y el riesgo de regresión también.
 *
 * ## Lo que desbloquea
 *
 * Las ACCIONES (`addPaperSpace`, `selectPaperSpace`, `commitPaperSpaces`,
 * `applyActiveTitleBlock`…) siguen en el monolito porque dependen de la
 * historia canónica y del borrador del cajetín; su siguiente turno es migrar
 * AQUÍ una a una, recibiendo esas dependencias por parámetro. Con el estado ya
 * fuera, el cuadro del juego de láminas podrá recibir DOS props (anfitrión y
 * borrador) en vez de cuarenta.
 */
import { useMemo, useSyncExternalStore } from "react";
import type { CadPaperSpace } from "@/lib/cad/cad-document";
import type { CadPublishSheet } from "@/lib/cad/paper-space";

type Updater<T> = T | ((previous: T) => T);

/**
 * La firma de un setter de React, calcada: dos sobrecargas para que el
 * parámetro de la función actualizadora INFIERA su tipo en el sitio de
 * llamada (`setX(current => …)`). Con una unión simple, TypeScript deja
 * `current` en `any` implícito y el trinquete de lint lo caza.
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

export interface CadPaperSpacesSnapshot {
  paperSpaces: CadPaperSpace[];
  activePaperSpaceId: string | null;
  activePaperViewportId: string | null;
  /** El cuadro del juego de láminas está abierto. */
  showSheetPackage: boolean;
  /** Hoja en previsualización dentro del cuadro, si hay. */
  layoutPreviewSheet: CadPublishSheet | null;
}

const INITIAL: CadPaperSpacesSnapshot = {
  paperSpaces: [],
  activePaperSpaceId: null,
  activePaperViewportId: null,
  showSheetPackage: false,
  layoutPreviewSheet: null,
};

export class CadPaperSpacesHost {
  private snapshot: CadPaperSpacesSnapshot = INITIAL;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Estable por identidad: `useSyncExternalStore` compara así. */
  getSnapshot = (): CadPaperSpacesSnapshot => this.snapshot;

  private patch(next: Partial<CadPaperSpacesSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  setPaperSpaces: CadStateSetter<CadPaperSpace[]> = (
    value: Updater<CadPaperSpace[]>,
  ): void => {
    this.patch({ paperSpaces: resolve(value, this.snapshot.paperSpaces) });
  };

  setActivePaperSpaceId: CadStateSetter<string | null> = (
    value: Updater<string | null>,
  ): void => {
    this.patch({
      activePaperSpaceId: resolve(value, this.snapshot.activePaperSpaceId),
    });
  };

  setActivePaperViewportId: CadStateSetter<string | null> = (
    value: Updater<string | null>,
  ): void => {
    this.patch({
      activePaperViewportId: resolve(value, this.snapshot.activePaperViewportId),
    });
  };

  setShowSheetPackage: CadStateSetter<boolean> = (
    value: Updater<boolean>,
  ): void => {
    this.patch({
      showSheetPackage: resolve(value, this.snapshot.showSheetPackage),
    });
  };

  setLayoutPreviewSheet: CadStateSetter<CadPublishSheet | null> = (
    value: Updater<CadPublishSheet | null>,
  ): void => {
    this.patch({
      layoutPreviewSheet: resolve(value, this.snapshot.layoutPreviewSheet),
    });
  };

  /** Al cerrar un documento el estado de láminas no puede sobrevivirle. */
  reset = (): void => {
    this.snapshot = INITIAL;
    for (const listener of this.listeners) listener();
  };
}

/** Un anfitrión por montaje del editor (misma vida que el resto de hosts). */
export function useCadPaperSpacesHost(): CadPaperSpacesHost {
  return useMemo(() => new CadPaperSpacesHost(), []);
}

/** El estado vivo, suscrito. El editor lo desestructura con sus nombres de siempre. */
export function useCadPaperSpaces(host: CadPaperSpacesHost): CadPaperSpacesSnapshot {
  return useSyncExternalStore(host.subscribe, host.getSnapshot, host.getSnapshot);
}
