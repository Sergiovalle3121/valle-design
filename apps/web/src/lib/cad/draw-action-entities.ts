import type { CadEntity } from "./cad-document";

/**
 * Traducción PURA de una acción de dibujo a UNA entidad canónica.
 *
 * Las herramientas básicas del editor escribían assets HEREDADOS: LINE creaba
 * un muro, POLYLINE varios muros desconectados, RECT una zona y CIRCLE una zona
 * con `shape: 'circle'`. El documento canónico acababa describiendo mobiliario
 * industrial en vez de geometría, así que propiedades, grips, OSNAP, DXF y el
 * round-trip trabajaban sobre una proyección y no sobre el dibujo real.
 *
 * Este módulo es la mitad determinista de la corrección: no toca React, ni
 * refs, ni escena. Recibe la acción y el contexto mínimo (capa activa y un
 * generador de ids) y devuelve la entidad canónica o el motivo del rechazo.
 * El editor conserva la responsabilidad de insertarla en una sola transacción.
 *
 * WALL y ZONE/ROOM NO pasan por aquí: siguen siendo comandos arquitectónicos
 * explícitos con semántica propia. Esto cubre sólo la geometría neutra.
 */

export interface DrawPoint {
  x: number;
  y: number;
}

/**
 * Subconjunto GEOMÉTRICO de `DrawAction` (`cad-command.ts`). Se declara aquí de
 * forma estructural para que el kernel no dependa de la capa de componentes;
 * las variantes de transformación (move/copy/offset) no crean entidades y por
 * eso no aparecen.
 */
export type CanonicalDrawAction =
  | { type: "addSegment"; a: DrawPoint; b: DrawPoint }
  | { type: "addPolyline"; points: DrawPoint[]; closed: boolean }
  | { type: "addRect"; x: number; y: number; w: number; h: number }
  | { type: "addCircle"; cx: number; cy: number; r: number };

export interface DrawActionEntityOptions {
  /** Capa activa del editor. La entidad nace en la capa en la que se dibuja. */
  layer: string;
  /** Generador de ids inyectado para que las pruebas sean deterministas. */
  newId: () => string;
  /**
   * Distancia por debajo de la cual dos puntos se consideran el mismo. Sirve
   * para rechazar lo degenerado (un clic doble no es una línea) y para fundir
   * vértices consecutivos repetidos.
   */
  epsilon?: number;
}

export type DrawActionEntityResult =
  | { ok: true; entity: CadEntity }
  | { ok: false; reason: DrawActionRejection };

export type DrawActionRejection =
  | "non-finite"
  | "degenerate-segment"
  | "degenerate-polyline"
  | "degenerate-rect"
  | "degenerate-circle";

const DEFAULT_EPSILON = 1e-6;

function finite(...values: number[]): boolean {
  return values.every((value) => Number.isFinite(value));
}

function samePoint(a: DrawPoint, b: DrawPoint, epsilon: number): boolean {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

/** Todo vértice canónico es 3D; el dibujo 2D vive en z = 0. */
function vertex(point: DrawPoint) {
  return { x: point.x, y: point.y, z: 0 };
}

/**
 * Funde vértices consecutivos repetidos. Un usuario que fija dos veces el mismo
 * punto no está declarando un segmento de longitud cero: está repitiendo el
 * clic, y una polilínea con vértices duplicados consecutivos es inválida para
 * el validador canónico y para DXF.
 */
function dedupeConsecutive(
  points: DrawPoint[],
  epsilon: number,
): DrawPoint[] {
  const out: DrawPoint[] = [];
  for (const point of points) {
    const previous = out[out.length - 1];
    if (previous && samePoint(previous, point, epsilon)) continue;
    out.push(point);
  }
  return out;
}

export function canonicalEntityFromDrawAction(
  action: CanonicalDrawAction,
  options: DrawActionEntityOptions,
): DrawActionEntityResult {
  const epsilon = options.epsilon ?? DEFAULT_EPSILON;
  const layer = options.layer;

  if (action.type === "addSegment") {
    if (!finite(action.a.x, action.a.y, action.b.x, action.b.y)) {
      return { ok: false, reason: "non-finite" };
    }
    if (samePoint(action.a, action.b, epsilon)) {
      return { ok: false, reason: "degenerate-segment" };
    }
    return {
      ok: true,
      entity: {
        id: options.newId(),
        type: "line",
        start: vertex(action.a),
        end: vertex(action.b),
        layer,
      },
    };
  }

  if (action.type === "addPolyline") {
    if (!action.points.every((point) => finite(point.x, point.y))) {
      return { ok: false, reason: "non-finite" };
    }
    let points = dedupeConsecutive(action.points, epsilon);
    // En una polilínea cerrada el cierre lo declara `closed`, no un vértice
    // repetido al final: duplicarlo produciría un segmento nulo en el DXF.
    if (
      action.closed &&
      points.length > 1 &&
      samePoint(points[0], points[points.length - 1], epsilon)
    ) {
      points = points.slice(0, -1);
    }
    // Abierta necesita 2 vértices; cerrada necesita 3 para encerrar área.
    if (points.length < (action.closed ? 3 : 2)) {
      return { ok: false, reason: "degenerate-polyline" };
    }
    return {
      ok: true,
      entity: {
        id: options.newId(),
        type: "polyline",
        vertices: points.map(vertex),
        closed: action.closed,
        layer,
      },
    };
  }

  if (action.type === "addRect") {
    if (!finite(action.x, action.y, action.w, action.h)) {
      return { ok: false, reason: "non-finite" };
    }
    // El arrastre puede venir en cualquier dirección: se normaliza a esquina
    // inferior-izquierda + tamaño positivo sin perder el rectángulo.
    const width = Math.abs(action.w);
    const height = Math.abs(action.h);
    if (width <= epsilon || height <= epsilon) {
      return { ok: false, reason: "degenerate-rect" };
    }
    const x = Math.min(action.x, action.x + action.w);
    const y = Math.min(action.y, action.y + action.h);
    return {
      ok: true,
      entity: {
        id: options.newId(),
        type: "polyline",
        // Cuatro vértices ÚNICOS: el cuarto lado lo cierra `closed`.
        vertices: [
          { x, y, z: 0 },
          { x: x + width, y, z: 0 },
          { x: x + width, y: y + height, z: 0 },
          { x, y: y + height, z: 0 },
        ],
        closed: true,
        layer,
      },
    };
  }

  if (!finite(action.cx, action.cy, action.r)) {
    return { ok: false, reason: "non-finite" };
  }
  if (action.r <= epsilon) {
    return { ok: false, reason: "degenerate-circle" };
  }
  return {
    ok: true,
    entity: {
      id: options.newId(),
      type: "circle",
      center: { x: action.cx, y: action.cy, z: 0 },
      radius: action.r,
      layer,
    },
  };
}

/** Mensaje para el usuario. El editor no debe inventar texto por su cuenta. */
export const DRAW_ACTION_REJECTION_MESSAGE: Record<
  DrawActionRejection,
  string
> = {
  "non-finite": "La geometría indicada no es válida.",
  "degenerate-segment": "Una línea necesita dos puntos distintos.",
  "degenerate-polyline":
    "Una polilínea necesita al menos dos vértices distintos (tres si es cerrada).",
  "degenerate-rect": "Un rectángulo necesita ancho y alto mayores que cero.",
  "degenerate-circle": "Un círculo necesita un radio mayor que cero.",
};

/** Etiqueta de historial/undo por comando: una entrada por acción. */
export const DRAW_ACTION_HISTORY_LABEL: Record<
  CanonicalDrawAction["type"],
  string
> = {
  addSegment: "create:line",
  addPolyline: "create:polyline",
  addRect: "create:rect",
  addCircle: "create:circle",
};
