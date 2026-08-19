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
import {
  validateCadView3dRequest,
  type CadStandardViewId,
  type CadView3dRequest,
} from "@/lib/cad/view/view-3d";

/**
 * Lo que el anfitrión necesita del controlador de vista. Se declara
 * estructuralmente y no como `CadViewController` para que las pruebas puedan
 * montarlo con un objeto de cuatro líneas en vez de con THREE entero.
 *
 * Los métodos de navegación 3D son OPCIONALES, y no por comodidad: un espacio de
 * trabajo sin visor de perspectiva —una previsualización de trazado, un guion
 * corriendo en Node— es un montaje legítimo, y en él `3DORBIT` tiene que decir
 * que no hay cámara que girar en vez de reventar. Lo que no puede es fingir que
 * giró algo.
 */
export interface CadViewControllerLike {
  readonly view: CadView;
  setView(view: CadView): void;
  orbitPerspective?(deltaAzimuthDeg: number, deltaElevationDeg: number): unknown;
  orbitFreePerspective?(
    deltaAzimuthDeg: number,
    deltaElevationDeg: number,
    deltaRollDeg?: number,
  ): unknown;
  setOrbit?(azimuthDeg: number, elevationDeg: number): unknown;
  applyStandardView?(id: CadStandardViewId): { label: string };
  panPerspective?(deltaXPx: number, deltaYPx: number): void;
  panPerspectiveDrawing?(dx: number, dy: number): void;
  zoomPerspective?(factor: number): void;
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

    // La navegación 3D se atiende ANTES de componer el estado de encuadre. No es
    // una optimización: `applyCadViewRequest` no puede resolverla —mover una
    // cámara no es aritmética sobre una `CadView`— y dejarla llegar hasta allí
    // sólo produciría un rechazo. Aquí sí está el controlador, que es quien
    // tiene las dos cámaras.
    if (request.kind === "view3d") return this.apply3d(controller, request.request);

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

  /**
   * Resuelve una petición de navegación 3D sobre el controlador.
   *
   * Se vuelve a validar aquí aunque el comando ya lo hiciera, porque por este
   * método entran también los guiones y AutoLISP, que no pasan por ningún
   * prompt. Y la vista 3D NO se apila en `ZOOM Previo`: la pila guarda encuadres
   * 2D —centro, altura y giro—, y meter ahí una órbita haría que «previo»
   * devolviera un encuadre que no es el que había.
   */
  private apply3d = (
    controller: CadViewControllerLike,
    request: CadView3dRequest,
  ): string => {
    const outcome = validateCadView3dRequest(request);
    if (!outcome.request) return outcome.message;
    const applied = outcome.request;
    const missing =
      "Este espacio de trabajo no tiene cámara en perspectiva: la navegación 3D no está disponible aquí.";

    switch (applied.kind) {
      case "orbit": {
        if (applied.mode === "free") {
          if (!controller.orbitFreePerspective) return missing;
          controller.orbitFreePerspective(
            applied.azimuthDeg,
            applied.elevationDeg,
            applied.rollDeg ?? 0,
          );
        } else {
          if (!controller.orbitPerspective) return missing;
          controller.orbitPerspective(applied.azimuthDeg, applied.elevationDeg);
        }
        break;
      }
      case "orbit-to": {
        if (!controller.setOrbit) return missing;
        controller.setOrbit(applied.azimuthDeg, applied.elevationDeg);
        break;
      }
      case "standard-view": {
        if (!controller.applyStandardView) return missing;
        controller.applyStandardView(applied.view);
        break;
      }
      case "pan": {
        if (!controller.panPerspective) return missing;
        controller.panPerspective(applied.dxPx, applied.dyPx);
        break;
      }
      case "pan-drawing": {
        if (!controller.panPerspectiveDrawing) return missing;
        controller.panPerspectiveDrawing(applied.dx, applied.dy);
        break;
      }
      case "zoom": {
        if (!controller.zoomPerspective) return missing;
        controller.zoomPerspective(applied.factor);
        break;
      }
    }
    this.publish();
    return outcome.message;
  };
}
