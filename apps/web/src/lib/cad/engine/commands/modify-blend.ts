/**
 * BLEND — la spline que fusiona dos curvas abiertas por sus extremos.
 *
 * ## Qué hace y por qué así
 *
 * Se designan dos curvas abiertas CERCA del extremo a fusionar —el punto del
 * clic decide el extremo, igual que en AutoCAD— y el comando emite UNA spline
 * que sale del primer extremo con su tangente y llega al segundo con la suya.
 * Las curvas originales no se tocan: fusionar no es unir (eso es JOIN), es
 * tender un puente suave entre dos trazos que no se tocan.
 *
 * ## Las dos continuidades, con su matemática dicha en voz alta
 *
 * · **Tangente (G1, por defecto)**: una Bézier cúbica de Hermite con los
 *   mangos a d/3 —el reparto clásico—, expresada como spline de grado 3 en
 *   forma de Bézier (nudos [0×4, 1×4]). Sale tangente y llega tangente; la
 *   curvatura en los extremos es la que resulte.
 *
 * · **Suave (G2)**: una quíntica de Hermite que además IGUALA la curvatura
 *   con signo de cada curva en su extremo, expresada como spline de grado 5
 *   (nudos [0×6, 1×6]). La curvatura de las curvas de apoyo se calcula
 *   ANALÍTICAMENTE por tipo —recta 0, arco ±1/r, elipse por sus derivadas—,
 *   no por diferencias finitas: un test puede afirmar el valor exacto.
 *
 * ## Qué se niega, y nombrándolo
 *
 * · Curvas CERRADAS (círculo, polilínea cerrada, elipse entera): no tienen
 *   extremo por el que fusionar.
 * · SPLINE: `curve-model.ts` no modela NURBS a propósito (lo dice su
 *   cabecera), y fusionar contra una poligonal aproximada saldría tangente a
 *   la aproximación, no a la curva. Se rechaza nombrando el tipo en vez de
 *   fingir una tangencia que no es.
 * · La misma entidad dos veces: AutoCAD también lo rechaza.
 */
import type { CadEntity, CadPoint2, CadPoint3 } from "../../cad-document";
import type { CadNativeEntity } from "../../entity-runtime";
import { cadEntityCurves, curvePointAt, type CadCurve } from "../../curve-model";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const DEG = Math.PI / 180;
const EPS = 1e-9;

const CONTINUITY = { keyword: "CONtinuidad", shortcut: "CON" } as const;
const TANGENT = { keyword: "Tangente", shortcut: "T" } as const;
const SMOOTH = { keyword: "Suave", shortcut: "S" } as const;

type BlendContinuity = "tangent" | "smooth";

interface Vec2 {
  x: number;
  y: number;
}

/** Velocidad p′(t) de una curva acotada, en unidades de dibujo por unidad de t. */
function curveVelocityAt(curve: CadCurve, t: number): Vec2 {
  if (curve.kind === "segment")
    return { x: curve.b.x - curve.a.x, y: curve.b.y - curve.a.y };
  if (curve.kind === "arc") {
    const angle = (curve.startAngle + curve.sweep * t) * DEG;
    const rate = curve.sweep * DEG;
    return {
      x: -curve.radius * rate * Math.sin(angle),
      y: curve.radius * rate * Math.cos(angle),
    };
  }
  // Elipse: p(t) = c + cosθ·M + sinθ·m, con m el semieje menor girado 90°.
  const minor = { x: -curve.major.y * curve.ratio, y: curve.major.x * curve.ratio };
  const angle = (curve.startParam + curve.sweep * t) * DEG;
  const rate = curve.sweep * DEG;
  return {
    x: rate * (-Math.sin(angle) * curve.major.x + Math.cos(angle) * minor.x),
    y: rate * (-Math.sin(angle) * curve.major.y + Math.cos(angle) * minor.y),
  };
}

/** Aceleración p″(t). Cero para la recta; centrípeta para arco y elipse. */
function curveAccelerationAt(curve: CadCurve, t: number): Vec2 {
  if (curve.kind === "segment") return { x: 0, y: 0 };
  if (curve.kind === "arc") {
    const angle = (curve.startAngle + curve.sweep * t) * DEG;
    const rate = curve.sweep * DEG;
    return {
      x: -curve.radius * rate * rate * Math.cos(angle),
      y: -curve.radius * rate * rate * Math.sin(angle),
    };
  }
  const minor = { x: -curve.major.y * curve.ratio, y: curve.major.x * curve.ratio };
  const angle = (curve.startParam + curve.sweep * t) * DEG;
  const rate = curve.sweep * DEG;
  return {
    x: -rate * rate * (Math.cos(angle) * curve.major.x + Math.sin(angle) * minor.x),
    y: -rate * rate * (Math.cos(angle) * curve.major.y + Math.sin(angle) * minor.y),
  };
}

/** Curvatura CON SIGNO en t: (p′ × p″) / |p′|³. Positiva a izquierdas. */
function curveSignedCurvatureAt(curve: CadCurve, t: number): number {
  const v = curveVelocityAt(curve, t);
  const a = curveAccelerationAt(curve, t);
  const speed = Math.hypot(v.x, v.y);
  if (speed <= EPS) return 0;
  return (v.x * a.y - v.y * a.x) / (speed * speed * speed);
}

/**
 * El marco de un extremo de la cadena: punto, dirección SALIENTE unitaria
 * (hacia fuera de la curva, más allá del extremo) y curvatura con signo de la
 * traversal que TERMINA en ese extremo. Recorrer una curva al revés invierte
 * el signo de su curvatura, y por eso el extremo `start` lo niega.
 */
interface CadCurveEndFrame {
  point: Vec2;
  outgoing: Vec2;
  curvature: number;
}

function endFrame(curves: readonly CadCurve[], end: "start" | "end"): CadCurveEndFrame | null {
  const curve = end === "end" ? curves[curves.length - 1] : curves[0];
  const t = end === "end" ? 1 : 0;
  const point = curvePointAt(curve, t);
  const velocity = curveVelocityAt(curve, t);
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed <= EPS) return null;
  const sign = end === "end" ? 1 : -1;
  return {
    point,
    outgoing: { x: (sign * velocity.x) / speed, y: (sign * velocity.y) / speed },
    curvature: sign * curveSignedCurvatureAt(curve, t),
  };
}

interface BlendAnchor {
  entityId: string;
  frame: CadCurveEndFrame;
}

/** Las curvas de la entidad, o el motivo (en texto) por el que no se fusiona. */
function blendCurvesOf(entity: CadEntity): CadCurve[] | string {
  const curves = cadEntityCurves(entity);
  if (!curves || curves.length === 0)
    return entity.type === "spline"
      ? "una SPLINE no se puede fusionar todavía: el modelo de curvas no cubre NURBS y una tangente sobre su aproximación sería mentira."
      : `${entity.type.toUpperCase()} no tiene curvas que fusionar.`;
  if (entity.type === "polyline" && entity.closed)
    return "la polilínea está cerrada: BLEND necesita curvas ABIERTAS con un extremo libre.";
  const start = curvePointAt(curves[0], 0);
  const end = curvePointAt(curves[curves.length - 1], 1);
  if (Math.hypot(end.x - start.x, end.y - start.y) <= 1e-9)
    return `${entity.type.toUpperCase()} es una curva cerrada: BLEND necesita curvas ABIERTAS con un extremo libre.`;
  return curves;
}

/** El extremo de la cadena más cercano al punto del clic. */
function nearestEnd(curves: readonly CadCurve[], pick: CadPoint2): "start" | "end" {
  const start = curvePointAt(curves[0], 0);
  const end = curvePointAt(curves[curves.length - 1], 1);
  const toStart = Math.hypot(pick.x - start.x, pick.y - start.y);
  const toEnd = Math.hypot(pick.x - end.x, pick.y - end.y);
  return toStart <= toEnd ? "start" : "end";
}

const perp = (v: Vec2): Vec2 => ({ x: -v.y, y: v.x });
const p3 = (v: Vec2): CadPoint3 => ({ x: v.x, y: v.y, z: 0 });

/**
 * Los puntos de control de la spline puente. Exportada para que la spec pueda
 * afirmar la geometría exacta sin recorrer la máquina de estados.
 */
export function cadBlendControlPoints(
  from: CadCurveEndFrame,
  to: CadCurveEndFrame,
  continuity: BlendContinuity,
): CadPoint3[] | null {
  const p0 = from.point;
  const p1 = to.point;
  const distance = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (distance <= 1e-9) return null;

  if (continuity === "tangent") {
    const reach = distance / 3;
    return [
      p3(p0),
      p3({ x: p0.x + from.outgoing.x * reach, y: p0.y + from.outgoing.y * reach }),
      p3({ x: p1.x + to.outgoing.x * reach, y: p1.y + to.outgoing.y * reach }),
      p3(p1),
    ];
  }

  // Quíntica de Hermite. La velocidad en cada extremo mide d —el reparto que
  // deja la cúbica tangente como caso particular— y la aceleración se elige
  // NORMAL a la marcha con módulo κ·d², que es exactamente lo que hace que la
  // curvatura con signo del puente iguale la de la curva de apoyo.
  const v0 = { x: from.outgoing.x * distance, y: from.outgoing.y * distance };
  const v1 = { x: -to.outgoing.x * distance, y: -to.outgoing.y * distance };
  const n0 = perp(from.outgoing);
  // En el extremo de llegada el puente entra REVERSANDO la salida de la otra
  // curva: su curvatura objetivo es la negada, y la normal es la de −outgoing.
  const n1 = perp(to.outgoing);
  const a0 = { x: from.curvature * distance * distance * n0.x, y: from.curvature * distance * distance * n0.y };
  const a1 = { x: to.curvature * distance * distance * n1.x, y: to.curvature * distance * distance * n1.y };
  return [
    p3(p0),
    p3({ x: p0.x + v0.x / 5, y: p0.y + v0.y / 5 }),
    p3({ x: p0.x + (2 * v0.x) / 5 + a0.x / 20, y: p0.y + (2 * v0.y) / 5 + a0.y / 20 }),
    p3({ x: p1.x - (2 * v1.x) / 5 + a1.x / 20, y: p1.y - (2 * v1.y) / 5 + a1.y / 20 }),
    p3({ x: p1.x - v1.x / 5, y: p1.y - v1.y / 5 }),
    p3(p1),
  ];
}

/** Nudos de una spline en forma de Bézier de un solo tramo: [0×(g+1), 1×(g+1)]. */
function singleBezierKnots(degree: number): number[] {
  const knots: number[] = [];
  for (let index = 0; index <= degree; index += 1) knots.push(0);
  for (let index = 0; index <= degree; index += 1) knots.push(1);
  return knots;
}

interface BlendState {
  continuity: BlendContinuity;
  first: BlendAnchor | null;
  /** `true` mientras se elige Tangente/Suave. */
  choosingContinuity: boolean;
}

function asking(state: BlendState): CadCommandStep<BlendState> {
  if (state.choosingContinuity)
    return {
      state,
      prompt: {
        message: "Precise la continuidad",
        options: [TANGENT, SMOOTH],
        defaultOption: state.continuity === "tangent" ? TANGENT.keyword : SMOOTH.keyword,
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  return {
    state,
    prompt: {
      message: state.first
        ? "Designe la segunda curva cerca del extremo a fusionar"
        : "Designe la primera curva cerca del extremo a fusionar",
      options: [CONTINUITY],
    },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_KEYWORD,
  };
}

function refuse(state: BlendState, text: string): CadCommandStep<BlendState> {
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "message", text: `BLEND: ${text}` },
  };
}

const blendCommand: CadCommandDescriptor<BlendState> = {
  name: "BLEND",
  aliases: ["BLE"],
  kind: "modify",
  transparent: false,
  // El punto del clic elige el EXTREMO, no sólo la entidad: una selección
  // previa no trae ese dato, así que el comando siempre pide sus dos clics.
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => asking({ continuity: "tangent", first: null, choosingContinuity: false }),
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return {
        state,
        prompt: { message: "", options: [] },
        accepts: 0,
        result: { kind: "none" },
      };

    if (state.choosingContinuity) {
      if (input.kind === "keyword")
        return asking({
          ...state,
          continuity: input.keyword === SMOOTH.keyword ? "smooth" : "tangent",
          choosingContinuity: false,
        });
      return asking({ ...state, choosingContinuity: false });
    }

    if (input.kind === "keyword" && input.keyword === CONTINUITY.keyword)
      return asking({ ...state, choosingContinuity: true });

    if (input.kind !== "entityPick") return asking(state);

    const entity = context.entity?.(input.entityId);
    if (!entity) return refuse(state, "el objeto designado ya no existe.");
    if (state.first && state.first.entityId === entity.id)
      return refuse(state, "designe dos curvas distintas; una curva no se fusiona consigo misma.");
    const curves = blendCurvesOf(entity);
    if (typeof curves === "string") return refuse(state, curves);
    const frame = endFrame(curves, nearestEnd(curves, input.point));
    if (!frame) return refuse(state, `el extremo de ${entity.id} degenera (velocidad nula); no hay tangente que continuar.`);

    if (!state.first) return asking({ ...state, first: { entityId: entity.id, frame } });

    const controlPoints = cadBlendControlPoints(state.first.frame, frame, state.continuity);
    if (!controlPoints)
      return refuse(state, "los extremos designados ya se tocan; no hay hueco que fusionar (para unir en una sola entidad, JOIN).");
    const degree = state.continuity === "tangent" ? 3 : 5;
    const spline: CadNativeEntity = {
      id: context.newEntityId(),
      type: "spline",
      degree,
      controlPoints,
      knots: singleBezierKnots(degree),
      layer: context.activeLayer,
    };
    return {
      state: { continuity: state.continuity, first: null, choosingContinuity: false },
      prompt: { message: "", options: [] },
      accepts: 0,
      result: {
        kind: "document",
        commands: [{ type: "insert", entity: spline }],
        label: "BLEND",
      },
    };
  },
};

export const CAD_MODIFY_BLEND_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(blendCommand),
];
