/**
 * Navegación tecleable: ZOOM, PAN, VIEW, REGEN y REGENALL como un modelo puro.
 *
 * ## Por qué aquí y no en el editor
 *
 * `view-controller.ts` ya sabe **sostener** una vista: dos cámaras, un
 * `pixelsPerUnit` y las conversiones pantalla↔mundo. Lo que no sabe es
 * **decidir** una vista: qué encuadre pide `ZOOM Extensión` sobre este dibujo,
 * qué significa `2XP`, dónde estaba la vista anterior, o qué guardó `VIEW`
 * con el nombre `PLANTA`. Eso es aritmética de navegación, y meterla en el
 * controlador lo ataría a THREE y al documento.
 *
 * Así que aquí no hay cámaras: entra una `CadView` —la misma que usa el
 * controlador, sin una segunda noción de vista— y sale otra. El anfitrión
 * llama a `viewController.setView(...)` con el resultado y ya está.
 *
 * ## La pila de vistas previas está ACOTADA, y es deliberado
 *
 * `ZOOM Previo` en AutoCAD recuerda las diez últimas vistas. Diez, no todas:
 * una pila sin tope sobre un gesto que se repite cada pocos segundos es una
 * fuga de memoria con otro nombre — una sesión larga acumularía decenas de
 * miles de instantáneas que nadie va a visitar. `CAD_VIEW_STACK_LIMIT` es ese
 * tope, y al desbordarse se descarta por el extremo antiguo.
 *
 * ## Qué guarda una vista con nombre
 *
 * Centro y **altura visible en unidades de dibujo**, no `pixelsPerUnit`. La
 * diferencia importa: `pixelsPerUnit` depende del tamaño del lienzo, así que
 * una vista guardada con la ventana maximizada y restaurada con el panel de
 * propiedades abierto encuadraría OTRA cosa. La altura en unidades de dibujo
 * es la magnitud que el usuario cree estar guardando, y es la que AutoCAD
 * guarda.
 */
import type { CadPoint2 } from "../cad-document";
import type { CadBounds } from "../entity-runtime";
import {
  cadViewZoomToBounds,
  clampPixelsPerUnit,
  type CadView,
} from "./cad-view";

/** Vistas previas recordadas. Diez es lo que recuerda AutoCAD. */
export const CAD_VIEW_STACK_LIMIT = 10;

/** Margen relativo con el que encuadran ZOOM Extensión, Todo, Ventana y Objeto. */
export const CAD_ZOOM_MARGIN_RATIO = 0.02;

/**
 * Instantánea de encuadre. Es lo que apila `ZOOM Previo` y lo que guarda
 * `VIEW`, sin el tamaño del lienzo: dos cosas distintas —dónde miro y con qué
 * ventana— que sólo se combinan al restaurar.
 */
export interface CadViewSnapshot {
  centerX: number;
  centerY: number;
  /** Altura visible en unidades de DIBUJO. Independiente del tamaño del lienzo. */
  height: number;
  twistDeg: number;
}

export interface CadNamedView extends CadViewSnapshot {
  /** Nombre canónico en mayúsculas: `VIEW R planta` restaura `PLANTA`. */
  name: string;
}

/** Las ocho opciones de ZOOM más el encuadre en tiempo real. */
export type CadZoomRequest =
  | { option: "all" }
  | { option: "extents" }
  | { option: "previous" }
  | { option: "center"; center: CadPoint2; height?: number }
  | { option: "window"; corner1: CadPoint2; corner2: CadPoint2 }
  | { option: "object"; entityIds: readonly string[] }
  /**
   * `2` (absoluto, respecto de la vista Todo), `2X` (respecto de la actual) y
   * `2XP` (respecto del papel). Los tres se teclean en el mismo hueco y sólo
   * se distinguen por el sufijo, así que se modelan como un solo caso con la
   * base explícita.
   */
  | { option: "scale"; factor: number; basis: "absolute" | "relative" | "paper" }
  /**
   * ZOOM Dinámico: el usuario coloca y dimensiona una caja de vista sobre el
   * dibujo entero y suelta. Lo que llega aquí es el resultado de ese gesto,
   * no el gesto: centro y altura de la caja.
   */
  | { option: "dynamic"; center: CadPoint2; height: number };

export type CadViewRequest =
  | { kind: "zoom"; zoom: CadZoomRequest }
  /** Desplazamiento en unidades de DIBUJO. El gesto interactivo ya lo resolvió. */
  | { kind: "pan"; displacement: CadPoint2 }
  | { kind: "view"; op: "save"; name: string }
  | { kind: "view"; op: "restore"; name: string }
  | { kind: "view"; op: "delete"; name: string }
  | { kind: "regen"; scope: "view" | "all" };

/**
 * Estado de navegación. Vive fuera de React —el presupuesto de `check:cad` sólo
 * permite que el número de `useState` del monolito baje— y se consume con
 * `useSyncExternalStore`, igual que el anfitrión del motor de comandos.
 */
export interface CadNavigationState {
  view: CadView;
  /** Vistas previas, de la más antigua a la más reciente. Acotada. */
  history: readonly CadViewSnapshot[];
  namedViews: readonly CadNamedView[];
  /** Regeneraciones pedidas. Sube con REGEN; el anfitrión reconstruye al verlo. */
  regenerations: number;
  /** De ellas, cuántas afectaban a TODAS las presentaciones (REGENALL). */
  regenerationsAll: number;
}

export interface CadNavigationContext {
  /** Envolvente de todo lo dibujado. `null` en un dibujo vacío. */
  extents: CadBounds | null;
  /** Límites del dibujo (LIMITS). `null` si no están fijados. */
  limits: CadBounds | null;
  /** Envolvente de una entidad, para `ZOOM Objeto`. */
  entityBounds?: (entityId: string) => CadBounds | null;
  /** Milímetros de papel por unidad de dibujo. Sólo lo usa `nXP`. */
  mmPerDrawingUnit?: number;
  /** Píxeles de pantalla por milímetro de papel. Sólo lo usa `nXP`. */
  screenPxPerMm?: number;
}

export interface CadNavigationOutcome {
  state: CadNavigationState;
  /** Renglón para la línea de comandos. Nunca vacío. */
  message: string;
  /** `false` cuando la petición no pudo aplicarse y el estado es el mismo. */
  changed: boolean;
}

export function createCadNavigationState(view: CadView): CadNavigationState {
  return {
    view,
    history: [],
    namedViews: [],
    regenerations: 0,
    regenerationsAll: 0,
  };
}

/** Altura visible en unidades de dibujo de una vista. */
export function cadViewHeight(view: CadView): number {
  return view.heightPx / view.pixelsPerUnit;
}

export function cadViewSnapshot(view: CadView): CadViewSnapshot {
  return {
    centerX: view.centerX,
    centerY: view.centerY,
    height: cadViewHeight(view),
    twistDeg: view.twistDeg,
  };
}

/**
 * Restaura una instantánea sobre el lienzo ACTUAL.
 *
 * La altura guardada se convierte en `pixelsPerUnit` con la altura de lienzo
 * de ahora, que es lo que hace que una vista guardada siga encuadrando lo
 * mismo aunque la ventana haya cambiado de tamaño.
 */
export function cadViewFromSnapshot(view: CadView, snapshot: CadViewSnapshot): CadView {
  return {
    ...view,
    centerX: snapshot.centerX,
    centerY: snapshot.centerY,
    twistDeg: snapshot.twistDeg,
    pixelsPerUnit: clampPixelsPerUnit(
      snapshot.height > 0 ? view.heightPx / snapshot.height : view.pixelsPerUnit,
    ),
  };
}

/**
 * Apila una vista, descartando por el extremo antiguo al llegar al tope.
 *
 * Exportada porque el anfitrión también apila: un arrastre de PAN con el ratón
 * o una rueda de zoom son vistas previas igual que `ZOOM Ventana`, y `ZOOM
 * Previo` tiene que poder volver a ellas.
 */
export function pushCadViewHistory(
  history: readonly CadViewSnapshot[],
  snapshot: CadViewSnapshot,
): readonly CadViewSnapshot[] {
  const next = [...history, snapshot];
  return next.length > CAD_VIEW_STACK_LIMIT
    ? next.slice(next.length - CAD_VIEW_STACK_LIMIT)
    : next;
}

function unionBounds(a: CadBounds | null, b: CadBounds | null): CadBounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function boundsFromCorners(a: CadPoint2, b: CadPoint2): CadBounds {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

function degenerate(bounds: CadBounds): boolean {
  return (
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.minY) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.maxY)
  );
}

/**
 * Un rectángulo sin área —una línea horizontal, un punto suelto— no se puede
 * encuadrar: `cadViewZoomToBounds` daría un zoom infinito. Se le da un grosor
 * proporcional a su otra dimensión, y si no tiene ninguna, uno arbitrario pero
 * finito. El resultado es que `ZOOM Objeto` sobre una línea recta funciona en
 * vez de dejar la pantalla en blanco.
 */
function inflateDegenerateBounds(bounds: CadBounds): CadBounds {
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const reference = Math.max(spanX, spanY);
  const padX = spanX > 1e-9 ? 0 : Math.max(reference * 0.5, 1);
  const padY = spanY > 1e-9 ? 0 : Math.max(reference * 0.5, 1);
  return {
    minX: bounds.minX - padX,
    minY: bounds.minY - padY,
    maxX: bounds.maxX + padX,
    maxY: bounds.maxY + padY,
  };
}

/**
 * Encuadre de `ZOOM Todo`.
 *
 * AutoCAD encuadra los LÍMITES, salvo que haya dibujo fuera de ellos: en ese
 * caso encuadra la unión, porque una vista «todo» que deja objetos fuera no es
 * todo. Sin límites fijados, la extensión es la única respuesta posible.
 */
export function cadZoomAllBounds(context: CadNavigationContext): CadBounds | null {
  if (!context.limits) return context.extents;
  if (!context.extents) return context.limits;
  const { limits, extents } = context;
  const outside =
    extents.minX < limits.minX ||
    extents.minY < limits.minY ||
    extents.maxX > limits.maxX ||
    extents.maxY > limits.maxY;
  return outside ? unionBounds(limits, extents) : limits;
}

function fit(
  state: CadNavigationState,
  bounds: CadBounds,
  message: string,
): CadNavigationOutcome {
  const safe = inflateDegenerateBounds(bounds);
  const view = cadViewZoomToBounds(state.view, safe, CAD_ZOOM_MARGIN_RATIO);
  return {
    state: {
      ...state,
      view,
      history: pushCadViewHistory(state.history, cadViewSnapshot(state.view)),
    },
    message,
    changed: true,
  };
}

function refuse(state: CadNavigationState, message: string): CadNavigationOutcome {
  return { state, message, changed: false };
}

function objectBounds(
  entityIds: readonly string[],
  context: CadNavigationContext,
): CadBounds | null {
  if (!context.entityBounds) return null;
  let bounds: CadBounds | null = null;
  for (const entityId of entityIds) {
    const single = context.entityBounds(entityId);
    if (single && !degenerate(single)) bounds = unionBounds(bounds, single);
  }
  return bounds;
}

/**
 * `nXP`: la escala del papel. Una unidad de dibujo mide
 * `mmPerDrawingUnit · factor` milímetros sobre el papel, y en pantalla eso son
 * tantos píxeles como diga `screenPxPerMm`. Es lo que hace que una ventana a
 * 1:50 se pueda VER a 1:50 antes de trazarla.
 */
function paperScalePixelsPerUnit(
  factor: number,
  context: CadNavigationContext,
): number | null {
  const mm = context.mmPerDrawingUnit;
  const px = context.screenPxPerMm;
  if (!(mm && mm > 0) || !(px && px > 0)) return null;
  return mm * factor * px;
}

function zoom(
  state: CadNavigationState,
  request: CadZoomRequest,
  context: CadNavigationContext,
): CadNavigationOutcome {
  switch (request.option) {
    case "all": {
      const bounds = cadZoomAllBounds(context);
      if (!bounds) return refuse(state, "El dibujo está vacío: no hay nada que encuadrar.");
      return fit(state, bounds, "ZOOM Todo.");
    }
    case "extents": {
      if (!context.extents)
        return refuse(state, "El dibujo está vacío: no hay nada que encuadrar.");
      return fit(state, context.extents, "ZOOM Extensión.");
    }
    case "previous": {
      const previous = state.history[state.history.length - 1];
      if (!previous) return refuse(state, "No hay ninguna vista previa que recuperar.");
      return {
        state: {
          ...state,
          view: cadViewFromSnapshot(state.view, previous),
          history: state.history.slice(0, -1),
        },
        message: "ZOOM Previo.",
        changed: true,
      };
    }
    case "window":
      return fit(
        state,
        boundsFromCorners(request.corner1, request.corner2),
        "ZOOM Ventana.",
      );
    case "object": {
      const bounds = objectBounds(request.entityIds, context);
      if (!bounds)
        return refuse(state, "Ninguno de los objetos designados tiene envolvente.");
      return fit(state, bounds, `ZOOM Objeto: ${request.entityIds.length} objeto(s).`);
    }
    case "center":
    case "dynamic": {
      const height = request.height;
      const pixelsPerUnit =
        height !== undefined && height > 0
          ? clampPixelsPerUnit(state.view.heightPx / height)
          : state.view.pixelsPerUnit;
      return {
        state: {
          ...state,
          view: {
            ...state.view,
            centerX: request.center.x,
            centerY: request.center.y,
            pixelsPerUnit,
          },
          history: pushCadViewHistory(state.history, cadViewSnapshot(state.view)),
        },
        message: request.option === "center" ? "ZOOM Centro." : "ZOOM Dinámico.",
        changed: true,
      };
    }
    case "scale": {
      if (!(request.factor > 0))
        return refuse(state, "El factor de escala debe ser mayor que cero.");
      if (request.basis === "relative")
        return {
          state: {
            ...state,
            view: {
              ...state.view,
              pixelsPerUnit: clampPixelsPerUnit(state.view.pixelsPerUnit * request.factor),
            },
            history: pushCadViewHistory(state.history, cadViewSnapshot(state.view)),
          },
          message: `ZOOM ${request.factor}X.`,
          changed: true,
        };
      if (request.basis === "paper") {
        const pixelsPerUnit = paperScalePixelsPerUnit(request.factor, context);
        if (pixelsPerUnit === null)
          return refuse(
            state,
            "ZOOM nXP necesita la escala del papel; abre una presentación primero.",
          );
        return {
          state: {
            ...state,
            view: { ...state.view, pixelsPerUnit: clampPixelsPerUnit(pixelsPerUnit) },
            history: pushCadViewHistory(state.history, cadViewSnapshot(state.view)),
          },
          message: `ZOOM ${request.factor}XP.`,
          changed: true,
        };
      }
      // Absoluto: `1` es la vista Todo, `2` el doble de cerca que ella. Sin
      // nada que encuadrar no hay referencia, y se dice en vez de inventarla.
      const bounds = cadZoomAllBounds(context);
      if (!bounds)
        return refuse(state, "Un factor absoluto necesita un dibujo con extensión.");
      const base = cadViewZoomToBounds(
        state.view,
        inflateDegenerateBounds(bounds),
        CAD_ZOOM_MARGIN_RATIO,
      );
      return {
        state: {
          ...state,
          view: {
            ...state.view,
            pixelsPerUnit: clampPixelsPerUnit(base.pixelsPerUnit * request.factor),
          },
          history: pushCadViewHistory(state.history, cadViewSnapshot(state.view)),
        },
        message: `ZOOM ${request.factor}.`,
        changed: true,
      };
    }
  }
}

const canonicalName = (name: string): string => name.trim().toUpperCase();

function namedView(
  state: CadNavigationState,
  request: Extract<CadViewRequest, { kind: "view" }>,
): CadNavigationOutcome {
  const name = canonicalName(request.name);
  if (!name) return refuse(state, "Una vista con nombre necesita un nombre.");

  if (request.op === "save") {
    const saved: CadNamedView = { name, ...cadViewSnapshot(state.view) };
    const replaced = state.namedViews.some((view) => view.name === name);
    return {
      state: {
        ...state,
        namedViews: [
          ...state.namedViews.filter((view) => view.name !== name),
          saved,
        ].sort((a, b) => a.name.localeCompare(b.name)),
      },
      message: replaced ? `Vista ${name} redefinida.` : `Vista ${name} guardada.`,
      changed: true,
    };
  }

  const stored = state.namedViews.find((view) => view.name === name);
  if (!stored) return refuse(state, `No existe ninguna vista llamada ${name}.`);

  if (request.op === "delete")
    return {
      state: { ...state, namedViews: state.namedViews.filter((view) => view.name !== name) },
      message: `Vista ${name} eliminada.`,
      changed: true,
    };

  return {
    state: {
      ...state,
      view: cadViewFromSnapshot(state.view, stored),
      history: pushCadViewHistory(state.history, cadViewSnapshot(state.view)),
    },
    message: `Vista ${name} restaurada.`,
    changed: true,
  };
}

/**
 * Aplica una petición de navegación. Función pura: mismo estado y misma
 * petición, mismo resultado.
 */
export function applyCadViewRequest(
  state: CadNavigationState,
  request: CadViewRequest,
  context: CadNavigationContext,
): CadNavigationOutcome {
  if (request.kind === "zoom") return zoom(state, request.zoom, context);

  if (request.kind === "pan") {
    const { x, y } = request.displacement;
    if (!Number.isFinite(x) || !Number.isFinite(y))
      return refuse(state, "El desplazamiento de PAN no es un vector válido.");
    if (x === 0 && y === 0) return refuse(state, "PAN sin desplazamiento.");
    return {
      state: {
        ...state,
        view: { ...state.view, centerX: state.view.centerX + x, centerY: state.view.centerY + y },
        history: pushCadViewHistory(state.history, cadViewSnapshot(state.view)),
      },
      message: `PAN ${x},${y}.`,
      changed: true,
    };
  }

  if (request.kind === "view") return namedView(state, request);

  // REGEN no cambia la vista: cambia el contador que el anfitrión observa para
  // reconstruir la escena. Modelarlo como un número y no como un callback es
  // lo que lo hace comprobable sin montar THREE.
  return {
    state: {
      ...state,
      regenerations: state.regenerations + 1,
      regenerationsAll:
        request.scope === "all" ? state.regenerationsAll + 1 : state.regenerationsAll,
    },
    message: request.scope === "all" ? "REGENALL: todo regenerado." : "REGEN: vista regenerada.",
    changed: true,
  };
}

/**
 * Interpreta el sufijo de un factor de ZOOM tecleado: `2`, `2X`, `2XP`.
 *
 * Vive aquí y no en el descriptor del comando porque la misma sintaxis la usan
 * los scripts y AutoLISP, que no pasan por el prompt.
 */
export function parseCadZoomScale(
  token: string,
): { factor: number; basis: "absolute" | "relative" | "paper" } | null {
  const value = token.trim().toUpperCase();
  if (!value) return null;
  const match = value.match(/^([+-]?(?:\d+\.?\d*|\.\d+))(XP|X)?$/);
  if (!match) return null;
  const factor = Number(match[1]);
  if (!Number.isFinite(factor) || factor <= 0) return null;
  return {
    factor,
    basis: match[2] === "XP" ? "paper" : match[2] === "X" ? "relative" : "absolute",
  };
}
