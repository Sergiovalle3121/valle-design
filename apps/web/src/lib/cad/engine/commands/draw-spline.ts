/**
 * SPLINE — la curva libre, por puntos de AJUSTE o por vértices de CONTROL.
 *
 * `spline.ts` lleva desde el primer día con la Bézier cúbica probada —evaluar,
 * partir, medir, y convertir una lista de puntos en una curva suave que PASA
 * por todos ellos (Catmull-Rom)—, y nadie la llamaba. La entidad `spline`
 * existe en el modelo, se tesela con De Boor, se acota, se selecciona y se
 * exporta. Faltaba, otra vez, la puerta.
 *
 * ## Los dos métodos, y por qué el de ajuste no es trivial
 *
 * · **Vértices de control (CV)**: los puntos designados SON los puntos de
 *   control. La curva los toca sólo en los extremos. Es una copia directa al
 *   modelo, sin conversión.
 *
 * · **Ajuste (por defecto)**: la curva tiene que PASAR por cada punto. Eso no
 *   es lo mismo: usar los puntos de ajuste como puntos de control produce una
 *   curva que se queda corta en cada codo, y es el error clásico de esta orden
 *   porque *parece* bien hasta que se acota.
 *
 *   La conversión exacta se apoya en el módulo huérfano: `catmullRomToBeziers`
 *   da una cadena de Béziers cúbicas que interpola los puntos, y una cadena de
 *   Béziers ES una B-spline de grado 3 con los nudos interiores repetidos tres
 *   veces (forma de Bézier). Así que la salida es una spline NURBS canónica de
 *   verdad —`3·m + 1` puntos de control y `3·m + 5` nudos para `m` tramos—, no
 *   una polilínea disfrazada.
 *
 * ## Tolerancia
 *
 * En AutoCAD la tolerancia relaja el ajuste por mínimos cuadrados. Aquí se
 * implementa como lo que un dibujante espera de ella y se puede afirmar sin
 * ambigüedad: **la curva puede separarse hasta `tolerancia` de los puntos
 * designados**, y se consigue descartando antes del ajuste los puntos que ya
 * quedan dentro de esa distancia de la cuerda (Douglas–Peucker). Con
 * tolerancia 0 no se descarta ninguno y el ajuste es exacto, así que el
 * comportamiento por defecto no cambia. NO es la relajación por mínimos
 * cuadrados de AutoCAD, y decirlo aquí es más barato que descubrirlo comparando
 * dibujos.
 */
import type { CadPoint2, CadPoint3 } from "../../cad-document";
import type { CadNativeEntity } from "../../entity-runtime";
import { catmullRomToBeziers } from "../../spline";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const METHOD = { keyword: "Método", shortcut: "M" } as const;
const FIT = { keyword: "Ajuste", shortcut: "A" } as const;
const CONTROL = { keyword: "CV", shortcut: "V" } as const;
const TOLERANCE = { keyword: "Tolerancia", shortcut: "T" } as const;
const DEGREE = { keyword: "Grado", shortcut: "G" } as const;
const CLOSE = { keyword: "Cerrar", shortcut: "C" } as const;
const UNDO = { keyword: "desHacer", shortcut: "H" } as const;

type SplineMethod = "fit" | "control";
type SplinePending = "none" | "method" | "tolerance" | "degree";

interface SplineState {
  method: SplineMethod;
  points: CadPoint2[];
  tolerance: number;
  /** Grado de la spline en modo CV. En modo ajuste es siempre 3. */
  degree: number;
  pending: SplinePending;
}

function initialState(): SplineState {
  return { method: "fit", points: [], tolerance: 0, degree: 3, pending: "none" };
}

/** Distancia perpendicular de `point` al segmento `a`–`b`. */
// Douglas–Peucker vive en `lib/cad/simplify.ts`: los adaptadores de entidad lo
// necesitan para el LOD y no pueden importar de un comando sin cerrar un ciclo.
// Se reexporta para que quien ya lo importaba de aquí siga funcionando y siga
// habiendo UNA implementación.
export { simplifyWithinTolerance } from "../../simplify";
import { simplifyWithinTolerance } from "../../simplify";

/** Nudos clamped uniformes: `n + grado + 1` valores. */
function clampedKnots(controlCount: number, degree: number): number[] {
  const spans = controlCount - degree;
  const knots: number[] = [];
  for (let index = 0; index <= degree; index += 1) knots.push(0);
  for (let index = 1; index < spans; index += 1) knots.push(index / spans);
  for (let index = 0; index <= degree; index += 1) knots.push(1);
  return knots;
}

/**
 * Cadena de Béziers cúbicas → B-spline de grado 3 en forma de Bézier.
 *
 * `m` tramos dan `3m + 1` puntos de control y el vector de nudos
 * `[0,0,0,0, 1/m ×3, 2/m ×3, …, 1,1,1,1]`, de longitud `3m + 5`, que es
 * exactamente `puntos + grado + 1`. La curva resultante es idéntica a la
 * cadena, no una aproximación.
 */
export function fitPointsToNurbs(
  points: readonly CadPoint2[],
): { controlPoints: CadPoint3[]; knots: number[] } | null {
  const beziers = catmullRomToBeziers(points.map((point) => ({ x: point.x, y: point.y })));
  if (beziers.length === 0) return null;
  const controlPoints: CadPoint3[] = [{ x: beziers[0].p0.x, y: beziers[0].p0.y, z: 0 }];
  for (const bezier of beziers)
    controlPoints.push(
      { x: bezier.p1.x, y: bezier.p1.y, z: 0 },
      { x: bezier.p2.x, y: bezier.p2.y, z: 0 },
      { x: bezier.p3.x, y: bezier.p3.y, z: 0 },
    );
  const spans = beziers.length;
  const knots = [0, 0, 0, 0];
  for (let span = 1; span < spans; span += 1) {
    const value = span / spans;
    knots.push(value, value, value);
  }
  knots.push(1, 1, 1, 1);
  return { controlPoints, knots };
}

function splineEntity(
  state: SplineState,
  closed: boolean,
  context: CadCommandContext,
): CadNativeEntity | null {
  const points = simplifyWithinTolerance(state.points, state.tolerance);
  // Una spline cerrada se ajusta repitiendo el primer punto al final: sin él,
  // la curva llegaría al último punto y volvería en línea recta.
  const source = closed && points.length >= 3 ? [...points, points[0]] : points;
  if (source.length < 2) return null;

  if (state.method === "control") {
    const degree = Math.max(1, Math.min(state.degree, source.length - 1));
    const controlPoints = source.map((point) => ({ x: point.x, y: point.y, z: 0 }));
    return {
      id: context.newEntityId(),
      type: "spline",
      degree,
      controlPoints,
      knots: clampedKnots(controlPoints.length, degree),
      ...(closed ? { closed: true } : {}),
      layer: context.activeLayer,
    };
  }

  const fitted = fitPointsToNurbs(source);
  if (!fitted) return null;
  return {
    id: context.newEntityId(),
    type: "spline",
    degree: 3,
    controlPoints: fitted.controlPoints,
    knots: fitted.knots,
    ...(closed ? { closed: true } : {}),
    layer: context.activeLayer,
  };
}

function finish(
  state: SplineState,
  closed: boolean,
  context: CadCommandContext,
): CadCommandStep<SplineState> {
  const entity = splineEntity(state, closed, context);
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: entity
      ? { kind: "document", commands: [{ type: "insert", entity }], label: "SPLINE" }
      : { kind: "none" },
  };
}

function splineStep(state: SplineState, context: CadCommandContext): CadCommandStep<SplineState> {
  if (state.pending === "method")
    return {
      state,
      prompt: {
        message: "Precise el método",
        options: [FIT, CONTROL],
        defaultOption: FIT.keyword,
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  if (state.pending === "tolerance")
    return {
      state,
      prompt: { message: "Precise la tolerancia de ajuste", options: [], defaultValue: "0" },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  if (state.pending === "degree")
    return {
      state,
      prompt: { message: "Precise el grado de la spline", options: [], defaultValue: "3" },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  if (state.points.length === 0)
    return {
      state,
      prompt: {
        message: state.method === "control" ? "Precise el primer vértice de control" : "Precise el primer punto",
        options: [METHOD],
      },
      accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    };
  return {
    state,
    prompt: {
      message: state.method === "control" ? "Precise el siguiente vértice de control" : "Precise el siguiente punto",
      options: [
        ...(state.points.length >= 3 ? [CLOSE] : []),
        ...(state.method === "control" ? [DEGREE] : [TOLERANCE]),
        UNDO,
      ],
    },
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    preview: [
      { points: context.cursor ? [...state.points, context.cursor] : state.points },
    ],
  };
}

const splineCommand: CadCommandDescriptor<SplineState> = {
  name: "SPLINE",
  aliases: ["SPL"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => splineStep(initialState(), context),
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    if (input.kind === "enter") {
      if (state.pending === "method") return splineStep({ ...state, method: "fit", pending: "none" }, context);
      if (state.pending !== "none") return splineStep({ ...state, pending: "none" }, context);
      return finish(state, false, context);
    }

    if (input.kind === "keyword") {
      if (input.keyword === METHOD.keyword) return splineStep({ ...state, pending: "method" }, context);
      if (input.keyword === FIT.keyword)
        return splineStep({ ...state, method: "fit", pending: "none" }, context);
      if (input.keyword === CONTROL.keyword)
        return splineStep({ ...state, method: "control", pending: "none" }, context);
      if (input.keyword === TOLERANCE.keyword)
        return splineStep({ ...state, pending: "tolerance" }, context);
      if (input.keyword === DEGREE.keyword) return splineStep({ ...state, pending: "degree" }, context);
      if (input.keyword === CLOSE.keyword) return finish(state, true, context);
      if (input.keyword === UNDO.keyword)
        return splineStep({ ...state, points: state.points.slice(0, -1) }, context);
      return splineStep(state, context);
    }

    if (input.kind === "distance") {
      if (state.pending === "tolerance")
        return splineStep({ ...state, tolerance: Math.abs(input.value), pending: "none" }, context);
      if (state.pending === "degree") {
        // El grado de una NURBS es un entero ≥ 1 y menor que el número de
        // puntos de control. Se recorta al rango en vez de escribir una
        // entidad que el teselado no sabría evaluar.
        const degree = Math.max(1, Math.min(10, Math.round(input.value)));
        return splineStep({ ...state, degree, pending: "none" }, context);
      }
      return splineStep(state, context);
    }

    if (input.kind !== "point") return splineStep(state, context);
    const last = state.points[state.points.length - 1];
    if (last && Math.hypot(input.point.x - last.x, input.point.y - last.y) < 1e-9)
      return splineStep(state, context);
    return splineStep({ ...state, points: [...state.points, input.point] }, context);
  },
};

export const CAD_DRAW_SPLINE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(splineCommand),
];
