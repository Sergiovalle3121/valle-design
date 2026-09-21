/**
 * BREAK, BREAKATPOINT y REVERSE: partir un objeto y darle la vuelta.
 *
 * Vivían en `modify-edges.ts` junto a TRIM y EXTEND. Se separaron cuando el
 * módulo pasó de 800 líneas (presupuesto de monolito) al juntar el hueco real
 * de BREAK con el modo rápido de TRIM: son dos familias distintas —cortar en
 * dos y recortar contra un borde— y comparten poco más que el registro.
 */
import type { CadEntity, CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { editCommands } from "./modify-edges";
import {
  computeCadCurveBreak,
  type CadEditableEntity,
} from "../../curve-edit";
import type { CadNativeEntity } from "../../entity-runtime";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
/** Lo que BREAK y BREAKATPOINT saben partir. Ni ELLIPSE ni SPLINE están aquí:
 * ninguno de los dos se pidió, y aceptar la designación para no hacer nada
 * distinto sería el defecto de siempre. */
const BREAK_TYPES = ["line", "arc", "circle", "polyline"] as const;

function asBreakable(entity: CadEntity | undefined): CadEditableEntity | null {
  return entity && (BREAK_TYPES as readonly string[]).includes(entity.type)
    ? (entity as CadEditableEntity)
    : null;
}

function breakTypeRefusal(entity: CadEntity | undefined, label: string): string {
  return `${label}: sólo se admiten LINE, ARC, CIRCLE y POLYLINE; se designó ${
    entity ? entity.type.toUpperCase() : "una entidad inexistente"
  }.`;
}

const FIRST_POINT = { keyword: "Primer punto", shortcut: "P" } as const;

interface BreakState {
  entityId: string | null;
  first: CadPoint2 | null;
  /**
   * Se pidió explícitamente `Primer punto`: el próximo punto que llegue
   * REEMPLAZA al primero en vez de cerrar la orden con el segundo.
   */
  askingFirst: boolean;
}

const EMPTY_BREAK: BreakState = { entityId: null, first: null, askingFirst: false };

function breakDone(result: CadCommandStep<BreakState>["result"]): CadCommandStep<BreakState> {
  return { state: EMPTY_BREAK, prompt: { message: "", options: [] }, accepts: 0, result };
}

function breakStep(state: BreakState): CadCommandStep<BreakState> {
  if (!state.entityId)
    return {
      state,
      prompt: { message: "Designe el objeto a partir", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  if (!state.first || state.askingFirst)
    return {
      state,
      prompt: { message: "Precise el primer punto de ruptura", options: [] },
      accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_ENTITY_PICK,
    };
  return {
    state,
    prompt: { message: "Precise el segundo punto de ruptura", options: [FIRST_POINT] },
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_KEYWORD,
  };
}

/**
 * BREAK parte un objeto quitando el tramo entre DOS puntos, con hueco real —
 * la convención de AutoCAD, opción `Primer punto` incluida: el punto de
 * designación es el primero por defecto, y esa opción permite precisar otro
 * antes de pedir el segundo.
 *
 * El trozo que conserva el id original es el que queda; el segundo —cuando la
 * curva es ABIERTA y el hueco cae por el medio— es una entidad nueva. Sobre
 * una curva CERRADA (CIRCLE, POLILÍNEA cerrada) el resultado es SIEMPRE una
 * sola pieza: un anillo al que se le quita un tramo deja un arco, no dos.
 */
const breakCommand: CadCommandDescriptor<BreakState> = {
  name: "BREAK",
  aliases: ["BR"],
  kind: "modify",
  transparent: false,
  selection: "command-first",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => breakStep(EMPTY_BREAK),
  step: (state, input, context) => {
    if (input.kind === "cancel" || input.kind === "enter") return breakDone({ kind: "none" });

    if (!state.entityId) {
      const id =
        input.kind === "entityPick"
          ? input.entityId
          : input.kind === "selection"
            ? input.entityIds[0]
            : null;
      if (!id) return breakStep(state);
      const found = context.entity?.(id);
      const target = asBreakable(found);
      if (!target) return breakDone({ kind: "message", text: breakTypeRefusal(found, "BREAK") });
      // El punto de designación es también el primer punto de ruptura, como en
      // AutoCAD: sólo hace falta pedirlo aparte si se designó por selección (sin
      // punto) o si luego se pide `Primer punto`.
      const first = input.kind === "entityPick" ? input.point : null;
      return breakStep({ entityId: id, first, askingFirst: false });
    }

    if (!state.first || state.askingFirst) {
      const point =
        input.kind === "point" ? input.point : input.kind === "entityPick" ? input.point : null;
      if (!point) return breakStep(state);
      return breakStep({ ...state, first: point, askingFirst: false });
    }

    if (input.kind === "keyword" && input.keyword === FIRST_POINT.keyword)
      return breakStep({ ...state, askingFirst: true });

    const second =
      input.kind === "point" ? input.point : input.kind === "entityPick" ? input.point : null;
    if (!second) return breakStep(state);

    const found = context.entity?.(state.entityId);
    const target = asBreakable(found);
    if (!target) return breakDone({ kind: "message", text: "BREAK: la entidad ya no existe." });

    const outcome = computeCadCurveBreak({
      target,
      first: state.first,
      second,
      newEntityId: context.newEntityId,
    });
    const commands = editCommands(target.id, outcome);
    if (commands.length === 0)
      return breakDone({
        kind: "message",
        text: `BREAK: ${"error" in outcome ? outcome.error : "no partió nada."}`,
      });
    return breakDone({ kind: "document", commands, label: "BREAK" });
  },
};

interface BreakAtPointState {
  entityId: string | null;
}

const EMPTY_BREAK_AT_POINT: BreakAtPointState = { entityId: null };

function breakAtPointStep(state: BreakAtPointState): CadCommandStep<BreakAtPointState> {
  if (!state.entityId)
    return {
      state,
      prompt: { message: "Designe el objeto a partir", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  return {
    state,
    prompt: { message: "Precise el punto de partición", options: [] },
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_ENTITY_PICK,
  };
}

/**
 * BREAKATPOINT: la mitad de BREAK que corta SIN dejar hueco —los dos puntos
 * coinciden—, como orden propia. Antes de esta ola era lo único que BREAK
 * sabía hacer, aunque respondía al nombre equivocado; ahora cada uno es el
 * suyo, como en AutoCAD.
 *
 * Un CÍRCULO se rechaza: partirlo en un solo punto no produce un hueco de
 * longitud cero identificable —el «antes» y el «después» del corte son el
 * mismo punto en un anillo— y hacen falta dos puntos distintos, que es lo que
 * pide BREAK.
 */
const breakAtPointCommand: CadCommandDescriptor<BreakAtPointState> = {
  name: "BREAKATPOINT",
  aliases: [],
  kind: "modify",
  transparent: false,
  selection: "command-first",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => breakAtPointStep(EMPTY_BREAK_AT_POINT),
  step: (state, input, context) => {
    const done = (
      result: CadCommandStep<BreakAtPointState>["result"],
    ): CadCommandStep<BreakAtPointState> => ({
      state: EMPTY_BREAK_AT_POINT,
      prompt: { message: "", options: [] },
      accepts: 0,
      result,
    });
    if (input.kind === "cancel" || input.kind === "enter") return done({ kind: "none" });

    if (!state.entityId) {
      const id =
        input.kind === "entityPick"
          ? input.entityId
          : input.kind === "selection"
            ? input.entityIds[0]
            : null;
      if (!id) return breakAtPointStep(state);
      const found = context.entity?.(id);
      const target = asBreakable(found);
      if (!target) return done({ kind: "message", text: breakTypeRefusal(found, "BREAKATPOINT") });
      if (target.type === "circle")
        return done({
          kind: "message",
          text: "BREAKATPOINT: un CÍRCULO no se puede partir en un solo punto; use BREAK con dos puntos.",
        });
      return breakAtPointStep({ entityId: id });
    }

    const point =
      input.kind === "point" ? input.point : input.kind === "entityPick" ? input.point : null;
    if (!point) return breakAtPointStep(state);

    const found = context.entity?.(state.entityId);
    const target = asBreakable(found);
    if (!target) return done({ kind: "message", text: "BREAKATPOINT: la entidad ya no existe." });

    const outcome = computeCadCurveBreak({
      target,
      first: point,
      second: null,
      newEntityId: context.newEntityId,
    });
    const commands = editCommands(target.id, outcome);
    if (commands.length === 0)
      return done({
        kind: "message",
        text: `BREAKATPOINT: ${"error" in outcome ? outcome.error : "no partió nada."}`,
      });
    return done({ kind: "document", commands, label: "BREAKATPOINT" });
  },
};

// ---------------------------------------------------------------------------
// REVERSE
// ---------------------------------------------------------------------------

/**
 * REVERSE invierte el SENTIDO de LINE, POLYLINE y SPLINE: lo que era el
 * primer vértice pasa a ser el último. No existía por ningún camino —ni
 * tecleado ni en un panel— aunque hace falta para preparar el camino de un
 * SWEEP o para corregir una polilínea trazada al revés de como se acota
 * (una cota alineada a lo largo de una polilínea lee sus tramos en el orden
 * de los vértices).
 *
 * ARC se queda fuera A PROPÓSITO. El esquema canónico no guarda una dirección
 * de un arco aparte de su forma: un arco SIEMPRE se recorre en sentido
 * antihorario de `startAngle` a `endAngle` (`cad-document.ts`), y esa dirección
 * de recorrido en un ángulo fijo es una propiedad DEL PUNTO sobre el círculo,
 * no de cuál de los dos extremos se llame «inicio». Intercambiar los dos
 * ángulos no invierte el sentido del MISMO arco: dibuja el arco
 * COMPLEMENTARIO (el resto de la circunferencia), una forma distinta. Aceptar
 * la designación y devolver otra geometría sería exactamente el defecto que
 * este producto paga caro: un «Hecho» silencioso sobre el dibujo equivocado.
 * Se rechaza nombrando el motivo en vez de fingir que se invirtió.
 */
const REVERSIBLE_TYPES = ["line", "polyline", "spline"] as const;
type CadReversibleEntity = Extract<CadEntity, { type: "line" | "polyline" | "spline" }>;

function asReversible(entity: CadEntity | undefined): CadReversibleEntity | null {
  return entity && (REVERSIBLE_TYPES as readonly string[]).includes(entity.type)
    ? (entity as CadReversibleEntity)
    : null;
}

type CadPolylineVertex = Extract<CadEntity, { type: "polyline" }>["vertices"][number];

/**
 * Invierte el orden de los vértices de una polilínea CONSERVANDO su forma
 * exacta.
 *
 * `bulge` y los anchos de un tramo van CON EL TRAMO, no con el vértice donde
 * viven hoy: describen lo que sale de ese vértice hacia el siguiente
 * (`cad-document.ts`). Al invertir el orden, cada tramo cambia de sentido —su
 * `bulge` cambia de signo (el mismo arco recorrido al revés) y sus dos anchos
 * se intercambian— y pasa a colgar del vértice que ahora lo empieza, no del
 * que lo empezaba antes. Sin este reparto, una polilínea con un solo tramo
 * curvo saldría con el arco en el tramo vecino y con la curvatura al revés.
 */
function reversedPolylineVertices(
  vertices: readonly CadPolylineVertex[],
  closed: boolean,
): CadPolylineVertex[] {
  const count = vertices.length;
  const reversed: CadPolylineVertex[] = [...vertices]
    .reverse()
    .map((vertex) => ({ x: vertex.x, y: vertex.y, z: vertex.z }));
  for (let index = 0; index < count; index += 1) {
    const hasSegment = closed || index < count - 1;
    if (!hasSegment) continue;
    const sourceIndex = closed ? (((count - 2 - index) % count) + count) % count : count - 2 - index;
    const source = vertices[sourceIndex];
    if (typeof source.bulge === "number") reversed[index].bulge = -source.bulge;
    if (typeof source.startWidth === "number" || typeof source.endWidth === "number") {
      if (typeof source.endWidth === "number") reversed[index].startWidth = source.endWidth;
      if (typeof source.startWidth === "number") reversed[index].endWidth = source.startWidth;
    }
  }
  return reversed;
}

function reversedEntity(entity: CadReversibleEntity): CadNativeEntity {
  if (entity.type === "line") return { ...entity, start: entity.end, end: entity.start };
  if (entity.type === "polyline")
    return { ...entity, vertices: reversedPolylineVertices(entity.vertices, entity.closed) };
  // SPLINE: pesos CON su punto (SPLINEDIT `inVertir`). Nudos invertidos con
  // `nuevo(i)=primero+último−original(m-i)`: un clamped uniforme es simétrico
  // y no se notaba, pero uno de DXF ajeno es arbitrario y sin esto sale OTRA curva.
  const [k0, kN] = [entity.knots[0], entity.knots.at(-1)!];
  return {
    ...entity,
    controlPoints: [...entity.controlPoints].reverse(),
    knots: [...entity.knots].reverse().map((k) => k0 + kN - k),
    ...(entity.weights ? { weights: [...entity.weights].reverse() } : {}),
  };
}

interface ReverseState {
  targets: readonly string[];
}

const EMPTY_REVERSE: ReverseState = { targets: [] };
const REVERSE_PROMPT = { message: "Designe objetos a invertir", options: [] } as const;
const REVERSE_ACCEPTS = CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK;

function reverseResult(targets: readonly string[], context: CadCommandContext): CadCommandStep<ReverseState> {
  const commands: CadEntityCommand[] = [];
  const refusals: string[] = [];
  for (const id of targets) {
    const entity = context.entity?.(id);
    const target = asReversible(entity);
    if (!target) {
      refusals.push(`${id} ${entity ? `es ${entity.type.toUpperCase()}` : "ya no existe"}.`);
      continue;
    }
    commands.push({ type: "replace", entityId: target.id, entity: reversedEntity(target) });
  }
  return {
    state: EMPTY_REVERSE,
    prompt: { message: "", options: [] },
    accepts: 0,
    result:
      commands.length > 0
        ? {
            kind: "document",
            commands,
            label: "REVERSE",
            ...(refusals.length > 0
              ? { notice: `REVERSE: sólo admite LINE, POLYLINE y SPLINE — ${refusals.join(" ")}` }
              : {}),
          }
        : {
            kind: "message",
            text:
              refusals.length > 0
                ? `REVERSE: sólo admite LINE, POLYLINE y SPLINE. ${refusals.join(" ")}`
                : "REVERSE: no se designó nada.",
          },
  };
}

const reverseCommand: CadCommandDescriptor<ReverseState> = {
  name: "REVERSE",
  aliases: [],
  kind: "modify",
  transparent: false,
  selection: "required",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) =>
    context.selection.length > 0
      ? reverseResult(context.selection, context)
      : { state: EMPTY_REVERSE, prompt: REVERSE_PROMPT, accepts: REVERSE_ACCEPTS },
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return { state: EMPTY_REVERSE, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    if (input.kind === "selection") return reverseResult(input.entityIds, context);
    if (input.kind === "entityPick")
      return {
        state: { targets: [...new Set([...state.targets, input.entityId])] },
        prompt: REVERSE_PROMPT,
        accepts: REVERSE_ACCEPTS,
      };
    if (input.kind === "enter") return reverseResult(state.targets, context);
    return { state, prompt: REVERSE_PROMPT, accepts: REVERSE_ACCEPTS };
  },
};


export const CAD_BREAK_COMMANDS = { breakCommand, breakAtPointCommand, reverseCommand };
