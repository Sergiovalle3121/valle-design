/**
 * Anfitrión de navegación: donde `ZOOM` deja de ser una petición y mueve la
 * cámara de verdad.
 *
 * ## Qué sostiene y qué no
 *
 * La VISTA no vive aquí. Vive en `CadViewController`, que es quien tiene las
 * dos cámaras, y una segunda copia sería una segunda verdad: el usuario también
 * hace zoom con la rueda y arrastra con el botón central, y esos gestos no
 * pasan por aquí. Lo que sí vive aquí es lo que el controlador no tiene y no
 * debe tener: la **pila acotada** de vistas previas, las **vistas con nombre** y
 * el **contador de regeneraciones**.
 *
 * Así que en cada petición se compone el estado —vista del controlador +
 * memoria propia—, se resuelve con `applyCadViewRequest`, y el resultado se
 * devuelve al controlador con `setView`. Una sola noción de vista, con memoria.
 *
 * ## Por qué no es un `useState`
 *
 * Por lo mismo que `CadCommandEngineHost`: el presupuesto de `check:cad` fija
 * el número de `useState` del monolito y sólo permite bajarlo. El estado vive
 * fuera de React y se lee con `useSyncExternalStore`.
 */
import type { CadBounds } from "@/lib/cad/entity-runtime";
import type { CadView } from "@/lib/cad/view/cad-view";
import {
  applyCadViewRequest,
  cadViewSnapshot,
  createCadNavigationState,
  pushCadViewHistory,
  type CadNamedView,
  type CadNavigationContext,
  type CadNavigationState,
  type CadViewRequest,
  type CadViewSnapshot,
} from "@/lib/cad/view/view-navigation";

/**
 * Lo que el anfitrión necesita del controlador de vista. Se declara
 * estructuralmente y no como `CadViewController` para que las pruebas puedan
 * montarlo con un objeto de cuatro líneas en vez de con THREE entero.
 */
export interface CadViewControllerLike {
  readonly view: CadView;
  setView(view: CadView): void;
}

export interface CadNavigationBridge {
  /** Controlador vivo, o `null` mientras no hay escena. */
  controller(): CadViewControllerLike | null;
  /** Envolvente de lo dibujado, en unidades de dibujo. */
  extents(): CadBounds | null;
  /** Límites del dibujo, si están fijados. */
  limits?(): CadBounds | null;
  entityBounds?(entityId: string): CadBounds | null;
  /** Milímetros de papel por unidad de dibujo, para `ZOOM nXP`. */
  mmPerDrawingUnit?(): number | undefined;
  screenPxPerMm?(): number | undefined;
  /**
   * Reconstrucción de la escena. REGEN sube un contador; el anfitrión decide
   * qué hacer con él. Puede no existir: entonces REGEN sigue contando y la
   * escena se refresca igualmente al reasignar la vista.
   */
  regen?(scope: "view" | "all"): void;
}

export interface CadNavigationSnapshot {
  namedViews: readonly CadNamedView[];
  /** Cuántas vistas previas se pueden recuperar ahora mismo. */
  historyDepth: number;
  regenerations: number;
  regenerationsAll: number;
}

const EMPTY_SNAPSHOT: CadNavigationSnapshot = {
  namedViews: [],
  historyDepth: 0,
  regenerations: 0,
  regenerationsAll: 0,
};

export class CadNavigationHost {
  private history: readonly CadViewSnapshot[] = [];
  private namedViews: readonly CadNamedView[] = [];
  private regenerations = 0;
  private regenerationsAll = 0;
  private snapshot: CadNavigationSnapshot = EMPTY_SNAPSHOT;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly bridge: CadNavigationBridge) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Misma identidad mientras nada cambie: `useSyncExternalStore` lo exige. */
  getSnapshot = (): CadNavigationSnapshot => this.snapshot;

  private publish(): void {
    this.snapshot = {
      namedViews: this.namedViews,
      historyDepth: this.history.length,
      regenerations: this.regenerations,
      regenerationsAll: this.regenerationsAll,
    };
    for (const listener of this.listeners) listener();
  }

  private context(): CadNavigationContext {
    return {
      extents: this.bridge.extents(),
      limits: this.bridge.limits?.() ?? null,
      ...(this.bridge.entityBounds
        ? { entityBounds: (id: string) => this.bridge.entityBounds!(id) }
        : {}),
      ...(this.bridge.mmPerDrawingUnit
        ? { mmPerDrawingUnit: this.bridge.mmPerDrawingUnit() }
        : {}),
      ...(this.bridge.screenPxPerMm ? { screenPxPerMm: this.bridge.screenPxPerMm() } : {}),
    };
  }

  /**
   * Recuerda el encuadre actual antes de un gesto del PUNTERO.
   *
   * La rueda y el arrastre no pasan por el motor de comandos, pero `ZOOM
   * Previo` tiene que poder volver a ellos: sin esta puerta, la pila sólo
   * recordaría los zooms tecleados y «previo» saltaría diez minutos atrás.
   */
  remember(): void {
    const controller = this.bridge.controller();
    if (!controller) return;
    this.history = pushCadViewHistory(this.history, cadViewSnapshot(controller.view));
    this.publish();
  }

  /**
   * Aplica una petición de navegación y devuelve el renglón que hay que
   * enseñar en la línea de comandos.
   */
  apply = (request: CadViewRequest): string => {
    const controller = this.bridge.controller();
    if (!controller)
      return "Todavía no hay ninguna vista activa: abre un dibujo antes de encuadrar.";

    const state: CadNavigationState = {
      ...createCadNavigationState(controller.view),
      history: this.history,
      namedViews: this.namedViews,
      regenerations: this.regenerations,
      regenerationsAll: this.regenerationsAll,
    };
    const outcome = applyCadViewRequest(state, request, this.context());

    this.history = outcome.state.history;
    this.namedViews = outcome.state.namedViews;
    const regenerated = outcome.state.regenerations > this.regenerations;
    const regeneratedAll = outcome.state.regenerationsAll > this.regenerationsAll;
    this.regenerations = outcome.state.regenerations;
    this.regenerationsAll = outcome.state.regenerationsAll;

    if (outcome.changed && outcome.state.view !== state.view)
      controller.setView(outcome.state.view);
    if (regenerated) this.bridge.regen?.(regeneratedAll ? "all" : "view");

    this.publish();
    return outcome.message;
  };
}
