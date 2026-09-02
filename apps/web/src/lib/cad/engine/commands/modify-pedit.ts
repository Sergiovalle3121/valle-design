/**
 * PEDIT y SPLINEDIT: editar una polilínea y una spline sin rehacerlas.
 *
 * Son las órdenes con las que se corrige un contorno ya dibujado. Sin ellas, la
 * única forma de cerrar una polilínea, mover un vértice o suavizarla es
 * borrarla y volver a trazarla — perdiendo de paso todo lo que la apuntaba.
 *
 * ## Lo que el esquema permite, y lo que no
 *
 * PEDIT `Ancho` fija el grosor de TODA la polilínea, no de un tramo. El
 * esquema canónico guarda el grosor en `context.presentation.lineweight`, que
 * es por entidad; el ancho POR TRAMO de AutoCAD no tiene dónde vivir y no se
 * finge. Lo mismo con la tangente por vértice.
 *
 * `Ajustar` produce un ARCO POR TRAMO que pasa por todos los vértices, con la
 * tangente de cada uno estimada por la media de sus cuerdas. No es la spline de
 * ajuste de AutoCAD —que interpola con continuidad de curvatura— pero sí pasa
 * exactamente por los puntos y se guarda como `bulge`, es decir, en el
 * documento canónico y en el DXF, sin inventar un tipo nuevo. `Spline` sí crea
 * una SPLINE de verdad, con los vértices como polígono de control.
 *
 * SPLINEDIT hace Cerrar, Mover vértice, Invertir y Convertir en polilínea. NO
 * hace `Refinar` (elevar el orden ni insertar nudos): eso cambia la base de la
 * curva y merece su propio corpus, así que se rechaza nombrándolo en vez de
 * aceptarse para no hacer nada.
 */
import type { CadEntity, CadPoint2, CadPoint3 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { tessellateSpline } from "../../curve-tessellate";
import type { CadNativeEntity } from "../../entity-runtime";
import { cadJoinCommands } from "./modify-join";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

type CadPolyline = Extract<CadEntity, { type: "polyline" }>;
type CadSpline = Extract<CadEntity, { type: "spline" }>;
type Vertex = CadPolyline["vertices"][number];

// ---------------------------------------------------------------------------
// Geometría de PEDIT
// ---------------------------------------------------------------------------

/**
 * Ajuste por arcos: un arco por tramo que pasa por sus dos vértices.
 *
 * La tangente en cada vértice interior es la dirección de la cuerda que une a
 * sus vecinos —la regla de Catmull-Rom— y en los extremos, la de su único
 * tramo. Con la tangente de salida `t` y la cuerda `c`, el arco que sale de un
 * punto tangente a `t` y llega al otro tiene barrido `2·ángulo(t, c)`, y su
 * `bulge` es `tan(barrido/4)`.
 */
export function cadPolylineFitBulges(vertices: readonly Vertex[], closed: boolean): number[] {
  const count = vertices.length;
  const segments = closed ? count : count - 1;
  if (segments < 1) return [];
  const at = (index: number) => vertices[((index % count) + count) % count];
  const bulges: number[] = [];
  for (let index = 0; index < segments; index += 1) {
    const current = at(index);
    const next = at(index + 1);
    const previous = closed || index > 0 ? at(index - 1) : current;
    const chordX = next.x - current.x;
    const chordY = next.y - current.y;
    if (Math.hypot(chordX, chordY) < 1e-12) {
      bulges.push(0);
      continue;
    }
    const tangentX = next.x - previous.x;
    const tangentY = next.y - previous.y;
    if (Math.hypot(tangentX, tangentY) < 1e-12) {
      bulges.push(0);
      continue;
    }
    const angle = Math.atan2(
      tangentX * chordY - tangentY * chordX,
      tangentX * chordX + tangentY * chordY,
    );
    // `angle` es el desvío de la cuerda respecto de la tangente, con signo del
    // producto vectorial. El barrido del arco es el DOBLE de ese desvío, y el
    // bulge, `tan(barrido/4)` = `tan(desvío/2)`. El signo sale solo, así que la
    // curva se dobla hacia el lado correcto sin comparar orientaciones a mano.
    bulges.push(Math.tan(angle / 2));
  }
  return bulges;
}

/** Nudos clamped uniformes: el vector que espera un SPLINE de grado `degree`. */
function clampedKnots(count: number, degree: number): number[] {
  const knots: number[] = [];
  const spans = count - degree;
  for (let index = 0; index < count + degree + 1; index += 1) {
    if (index <= degree) knots.push(0);
    else if (index >= count) knots.push(spans);
    else knots.push(index - degree);
  }
  return knots;
}

function withVertices(polyline: CadPolyline, vertices: Vertex[], closed?: boolean): CadNativeEntity {
  return { ...polyline, vertices, closed: closed ?? polyline.closed };
}

/** El vértice más cercano al punto, y su índice. */
function nearestVertex(vertices: readonly Vertex[], point: CadPoint2): number {
  let best = 0;
  let bestDistance = Infinity;
  vertices.forEach((vertex, index) => {
    const distance = Math.hypot(vertex.x - point.x, vertex.y - point.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

// ---------------------------------------------------------------------------
// PEDIT
// ---------------------------------------------------------------------------

const PEDIT_OPTIONS = [
  { keyword: "Cerrar", shortcut: "C" },
  { keyword: "Abrir", shortcut: "A" },
  { keyword: "Juntar", shortcut: "J" },
  { keyword: "Ancho", shortcut: "AN" },
  { keyword: "Editarvértice", shortcut: "E" },
  { keyword: "Ajustar", shortcut: "AJ" },
  { keyword: "Spline", shortcut: "S" },
  { keyword: "Curvar", shortcut: "CU" },
] as const;

const VERTEX_OPTIONS = [
  { keyword: "Mover", shortcut: "M" },
  { keyword: "Insertar", shortcut: "I" },
  { keyword: "Eliminar", shortcut: "E" },
] as const;

type PeditPhase = "target" | "options" | "width" | "vertexPick" | "vertexAction" | "vertexPoint" | "join";

interface PeditState {
  targetId: string | null;
  phase: PeditPhase;
  vertexIndex: number | null;
  vertexAction: "Mover" | "Insertar" | null;
  joinTargets: string[];
  /** Distancia de aproximación de Juntar (AutoCAD «Fuzz distance»); 0 = extremos exactos. */
  joinFuzz: number;
}

const EMPTY_PEDIT: PeditState = {
  targetId: null,
  phase: "target",
  vertexIndex: null,
  vertexAction: null,
  joinTargets: [],
  joinFuzz: 0,
};

function peditStep(state: PeditState): CadCommandStep<PeditState> {
  if (state.phase === "target")
    return {
      state,
      prompt: { message: "Designe la polilínea", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  if (state.phase === "width")
    return {
      state,
      prompt: { message: "Precise el nuevo ancho para toda la polilínea", options: [] },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  if (state.phase === "vertexPick")
    return {
      state,
      prompt: { message: "Señale el vértice", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  if (state.phase === "vertexAction")
    return {
      state,
      prompt: { message: "Qué hacer con el vértice", options: [...VERTEX_OPTIONS] },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  if (state.phase === "vertexPoint")
    return {
      state,
      prompt: {
        message: state.vertexAction === "Insertar" ? "Precise el vértice nuevo" : "Precise la posición",
        options: [],
      },
      accepts: CAD_ACCEPT_POINT,
    };
  if (state.phase === "join")
    return {
      state,
      prompt: {
        message:
          state.joinFuzz > 0
            ? `Distancia de aproximación ${state.joinFuzz}. Designe los objetos a juntar`
            : "Designe los objetos a juntar, o teclee la distancia de aproximación",
        options: [],
      },
      // La distancia de aproximación de AutoCAD (PEDIT Múltiple Juntar): un
      // número en este prompt fija cuánto hueco cuenta como contacto (Ola D).
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION | CAD_ACCEPT_DISTANCE,
    };
  return {
    state,
    prompt: { message: "Indique una opción de polilínea", options: [...PEDIT_OPTIONS] },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

function finish(
  result: CadCommandStep<PeditState>["result"],
): CadCommandStep<PeditState> {
  return { state: EMPTY_PEDIT, prompt: { message: "", options: [] }, accepts: 0, result };
}

const emit = (commands: CadEntityCommand[]) =>
  finish({ kind: "document", commands, label: "PEDIT" });
const reject = (text: string) => finish({ kind: "message", text: `PEDIT: ${text}` });

function peditKeyword(
  state: PeditState,
  keyword: string,
  polyline: CadPolyline,
): CadCommandStep<PeditState> {
  if (keyword === "Cerrar" || keyword === "Abrir") {
    const closed = keyword === "Cerrar";
    if (polyline.closed === closed)
      return reject(closed ? "la polilínea ya está cerrada." : "la polilínea ya está abierta.");
    if (closed && polyline.vertices.length < 3)
      return reject("hacen falta al menos tres vértices para cerrar.");
    return emit([{ type: "properties", entityId: polyline.id, patch: { closed } }]);
  }
  if (keyword === "Ancho") return peditStep({ ...state, phase: "width" });
  if (keyword === "Editarvértice") return peditStep({ ...state, phase: "vertexPick" });
  if (keyword === "Juntar") return peditStep({ ...state, phase: "join" });
  if (keyword === "Curvar") {
    if (polyline.vertices.every((vertex) => (vertex.bulge ?? 0) === 0))
      return reject("la polilínea ya es de tramos rectos.");
    return emit([
      {
        type: "replace",
        entityId: polyline.id,
        entity: withVertices(
          polyline,
          polyline.vertices.map((vertex) => ({ ...vertex, bulge: undefined })),
        ),
      },
    ]);
  }
  if (keyword === "Ajustar") {
    const bulges = cadPolylineFitBulges(polyline.vertices, polyline.closed);
    if (bulges.length === 0) return reject("la polilínea no tiene tramos que ajustar.");
    return emit([
      {
        type: "replace",
        entityId: polyline.id,
        entity: withVertices(
          polyline,
          polyline.vertices.map((vertex, index) =>
            index < bulges.length && bulges[index] !== 0
              ? { ...vertex, bulge: bulges[index] }
              : { ...vertex, bulge: undefined },
          ),
        ),
      },
    ]);
  }
  if (keyword === "Spline") {
    if (polyline.vertices.length < 3)
      return reject("hacen falta al menos tres vértices para convertirla en spline.");
    const degree = Math.min(3, polyline.vertices.length - 1);
    const controlPoints: CadPoint3[] = polyline.vertices.map((vertex) => ({
      x: vertex.x,
      y: vertex.y,
      z: vertex.z ?? 0,
    }));
    return emit([
      {
        type: "replace",
        entityId: polyline.id,
        entity: {
          id: polyline.id,
          type: "spline",
          degree,
          controlPoints,
          knots: clampedKnots(controlPoints.length, degree),
          closed: polyline.closed,
          layer: polyline.layer,
          ...(polyline.context ? { context: polyline.context } : {}),
        },
      },
    ]);
  }
  return peditStep(state);
}

function peditVertex(
  state: PeditState,
  polyline: CadPolyline,
  point: CadPoint2,
): CadCommandStep<PeditState> {
  const index = state.vertexIndex ?? 0;
  const vertices = [...polyline.vertices];
  if (state.vertexAction === "Mover") {
    vertices[index] = { ...vertices[index], x: point.x, y: point.y };
  } else {
    // Insertar mete el vértice DETRÁS del señalado, que es donde AutoCAD lo
    // pone: se señala el tramo por su vértice de arranque.
    vertices.splice(index + 1, 0, { x: point.x, y: point.y, z: vertices[index].z ?? 0 });
  }
  return emit([
    { type: "replace", entityId: polyline.id, entity: withVertices(polyline, vertices) },
  ]);
}

const peditCommand: CadCommandDescriptor<PeditState> = {
  name: "PEDIT",
  aliases: ["PE"],
  kind: "modify",
  transparent: false,
  selection: "command-first",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => peditStep(EMPTY_PEDIT),
  step: (state, input, context) => {
    if (input.kind === "cancel") return finish({ kind: "none" });

    if (state.phase === "target") {
      const id =
        input.kind === "entityPick"
          ? input.entityId
          : input.kind === "selection"
            ? input.entityIds[0]
            : null;
      if (!id) return peditStep(state);
      const entity = context.entity?.(id);
      if (!entity) return reject(`${id} ya no existe.`);
      if (entity.type !== "polyline")
        return reject(
          `sólo se edita una POLYLINE; se designó ${entity.type.toUpperCase()}. Una línea o un arco se convierten primero con JOIN.`,
        );
      return peditStep({ ...state, targetId: id, phase: "options" });
    }

    const polyline = context.entity?.(state.targetId ?? "");
    if (!polyline || polyline.type !== "polyline") return reject("la polilínea ya no existe.");

    if (state.phase === "join") {
      if (input.kind === "entityPick")
        return peditStep({
          ...state,
          joinTargets: [...new Set([...state.joinTargets, input.entityId])],
        });
      if (input.kind === "selection")
        return peditStep({
          ...state,
          joinTargets: [...new Set([...state.joinTargets, ...input.entityIds])],
        });
      if (input.kind === "distance") {
        if (!(input.value >= 0)) return reject("la distancia de aproximación no puede ser negativa.");
        return peditStep({ ...state, joinFuzz: input.value });
      }
      if (input.kind !== "enter") return peditStep(state);
      const others = state.joinTargets
        .map((id) => context.entity?.(id))
        .filter((entity): entity is CadEntity => !!entity);
      if (others.length === 0) return reject("no se designó nada que juntar.");
      // La unión es la MISMA que la de JOIN. Duplicar aquí sus reglas —qué es
      // colineal, qué encadena— habría dejado dos comandos que responden
      // distinto a la misma pareja de objetos.
      const outcome = cadJoinCommands([polyline, ...others], state.joinFuzz > 0 ? state.joinFuzz : undefined);
      return typeof outcome === "string" ? reject(outcome) : emit(outcome);
    }

    if (state.phase === "width") {
      if (input.kind !== "distance") return peditStep(state);
      if (!(input.value >= 0)) return reject("el ancho no puede ser negativo.");
      return emit([
        {
          type: "presentation",
          entityId: polyline.id,
          presentation: {
            ...(polyline.context?.presentation ?? {}),
            lineweight: { source: "explicit", value: input.value },
          },
        },
      ]);
    }

    if (state.phase === "vertexPick") {
      if (input.kind !== "point") return peditStep(state);
      return peditStep({
        ...state,
        vertexIndex: nearestVertex(polyline.vertices, input.point),
        phase: "vertexAction",
      });
    }

    if (state.phase === "vertexAction") {
      if (input.kind !== "keyword") return peditStep(state);
      if (input.keyword === "Eliminar") {
        if (polyline.vertices.length <= 2)
          return reject("una polilínea de dos vértices no puede perder ninguno.");
        const vertices = polyline.vertices.filter((_, index) => index !== state.vertexIndex);
        return emit([
          { type: "replace", entityId: polyline.id, entity: withVertices(polyline, vertices) },
        ]);
      }
      if (input.keyword === "Mover" || input.keyword === "Insertar")
        return peditStep({ ...state, vertexAction: input.keyword, phase: "vertexPoint" });
      return peditStep(state);
    }

    if (state.phase === "vertexPoint") {
      if (input.kind !== "point") return peditStep(state);
      return peditVertex(state, polyline, input.point);
    }

    if (input.kind === "enter") return finish({ kind: "none" });
    if (input.kind !== "keyword") return peditStep(state);
    return peditKeyword(state, input.keyword, polyline);
  },
};

// ---------------------------------------------------------------------------
// SPLINEDIT
// ---------------------------------------------------------------------------

const SPLINEDIT_OPTIONS = [
  { keyword: "Cerrar", shortcut: "C" },
  { keyword: "Abrir", shortcut: "A" },
  { keyword: "Movervértice", shortcut: "M" },
  { keyword: "inVertir", shortcut: "V" },
  { keyword: "Polilínea", shortcut: "P" },
  { keyword: "Refinar", shortcut: "R" },
] as const;

interface SplineditState {
  targetId: string | null;
  phase: "target" | "options" | "vertexPick" | "vertexPoint";
  vertexIndex: number | null;
}

const EMPTY_SPLINEDIT: SplineditState = { targetId: null, phase: "target", vertexIndex: null };

function splineditStep(state: SplineditState): CadCommandStep<SplineditState> {
  if (state.phase === "target")
    return {
      state,
      prompt: { message: "Designe la spline", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  if (state.phase === "vertexPick")
    return {
      state,
      prompt: { message: "Señale el punto de control", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  if (state.phase === "vertexPoint")
    return {
      state,
      prompt: { message: "Precise la posición nueva", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  return {
    state,
    prompt: { message: "Indique una opción de spline", options: [...SPLINEDIT_OPTIONS] },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

function splineFinish(
  result: CadCommandStep<SplineditState>["result"],
): CadCommandStep<SplineditState> {
  return { state: EMPTY_SPLINEDIT, prompt: { message: "", options: [] }, accepts: 0, result };
}

const splineEmit = (commands: CadEntityCommand[]) =>
  splineFinish({ kind: "document", commands, label: "SPLINEDIT" });
const splineReject = (text: string) =>
  splineFinish({ kind: "message", text: `SPLINEDIT: ${text}` });

function splineKeyword(
  state: SplineditState,
  keyword: string,
  spline: CadSpline,
): CadCommandStep<SplineditState> {
  if (keyword === "Cerrar" || keyword === "Abrir") {
    const closed = keyword === "Cerrar";
    if ((spline.closed === true) === closed)
      return splineReject(closed ? "la spline ya está cerrada." : "la spline ya está abierta.");
    return splineEmit([
      { type: "replace", entityId: spline.id, entity: { ...spline, closed } },
    ]);
  }
  if (keyword === "Movervértice") return splineditStep({ ...state, phase: "vertexPick" });
  if (keyword === "inVertir")
    return splineEmit([
      {
        type: "replace",
        entityId: spline.id,
        entity: {
          ...spline,
          controlPoints: [...spline.controlPoints].reverse(),
          // Los pesos van CON su punto de control: invertir unos sin los otros
          // cambia la forma de la curva sin mover un solo punto.
          ...(spline.weights ? { weights: [...spline.weights].reverse() } : {}),
        },
      },
    ]);
  if (keyword === "Polilínea") {
    const points = tessellateSpline(spline.controlPoints, spline.degree, spline.knots, 64);
    if (points.length < 2) return splineReject("la spline no se pudo evaluar.");
    return splineEmit([
      {
        type: "replace",
        entityId: spline.id,
        entity: {
          id: spline.id,
          type: "polyline",
          vertices: points.map((point) => ({ x: point.x, y: point.y, z: 0 })),
          closed: spline.closed === true,
          layer: spline.layer,
          ...(spline.context ? { context: spline.context } : {}),
        },
      },
    ]);
  }
  if (keyword === "Refinar")
    return splineReject(
      "`Refinar` (elevar el orden o insertar nudos) todavía no está implementado: cambia la base de la curva y necesita su propio corpus.",
    );
  return splineditStep(state);
}

const splineditCommand: CadCommandDescriptor<SplineditState> = {
  name: "SPLINEDIT",
  aliases: ["SPE"],
  kind: "modify",
  transparent: false,
  selection: "command-first",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => splineditStep(EMPTY_SPLINEDIT),
  step: (state, input, context) => {
    if (input.kind === "cancel") return splineFinish({ kind: "none" });

    if (state.phase === "target") {
      const id =
        input.kind === "entityPick"
          ? input.entityId
          : input.kind === "selection"
            ? input.entityIds[0]
            : null;
      if (!id) return splineditStep(state);
      const entity = context.entity?.(id);
      if (!entity) return splineReject(`${id} ya no existe.`);
      if (entity.type !== "spline")
        return splineReject(`sólo se edita una SPLINE; se designó ${entity.type.toUpperCase()}.`);
      return splineditStep({ ...state, targetId: id, phase: "options" });
    }

    const spline = context.entity?.(state.targetId ?? "");
    if (!spline || spline.type !== "spline") return splineReject("la spline ya no existe.");

    if (state.phase === "vertexPick") {
      if (input.kind !== "point") return splineditStep(state);
      let best = 0;
      let bestDistance = Infinity;
      spline.controlPoints.forEach((point, index) => {
        const distance = Math.hypot(point.x - input.point.x, point.y - input.point.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      return splineditStep({ ...state, vertexIndex: best, phase: "vertexPoint" });
    }

    if (state.phase === "vertexPoint") {
      if (input.kind !== "point") return splineditStep(state);
      const controlPoints = spline.controlPoints.map((point, index) =>
        index === state.vertexIndex
          ? { x: input.point.x, y: input.point.y, z: point.z }
          : point,
      );
      return splineEmit([
        { type: "replace", entityId: spline.id, entity: { ...spline, controlPoints } },
      ]);
    }

    if (input.kind === "enter") return splineFinish({ kind: "none" });
    if (input.kind !== "keyword") return splineditStep(state);
    return splineKeyword(state, input.keyword, spline);
  },
};

export const CAD_MODIFY_PEDIT_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(peditCommand),
  asCadCommand(splineditCommand),
];
