/**
 * POINT, DIVIDE y MEASURE — las tres órdenes que colocan NODOS.
 *
 * Las tres emiten entidades `point`, que el esquema 4 estrena. Y las dos
 * últimas llaman por fin a `divide-measure.ts`, otro módulo probado que llevaba
 * meses sin que nadie lo importara.
 *
 * ## DIVIDE y MEASURE no son lo mismo, y se confunden
 *
 * DIVIDE parte el objeto en N tramos IGUALES: coloca N−1 marcas interiores.
 * MEASURE va poniendo marcas cada cierta distancia desde el principio, y la
 * última puede caer antes del final si la longitud no es múltiplo. Colocar N
 * marcas en DIVIDE (en vez de N−1) o empezar MEASURE en el origen son los dos
 * errores clásicos: el dibujo sale con una marca de más, en un sitio creíble.
 *
 * ## Por qué se tesela
 *
 * «Repartir a distancias iguales» significa longitud de ARCO real, no
 * interpolar entre vértices. Un arco, una elipse o una spline se teselan
 * finamente con el mismo renderizador que usa el producto y se reparte sobre
 * esa polilínea — que es exactamente lo que `divide-measure.ts` espera.
 *
 * ## Lo que NO hace
 *
 * La opción `Bloque` de AutoCAD (colocar un BLOQUE en cada marca, alineado con
 * la tangente) se RECHAZA con un aviso explícito. Está a medio camino de
 * funcionar: la tangente ya se calcula y el INSERT ya existe, pero elegir el
 * bloque exige un diálogo que este motor no tiene. Un rechazo que se lee es
 * mejor que una opción que parece hacer algo.
 */
import type { CadPoint2 } from "../../cad-document";
import { dividePath, measurePath } from "../../divide-measure";
import type { CadEntityCommand } from "../../entity-commands";
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "../../entity-runtime";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const STYLE = { keyword: "Estilo", shortcut: "E" } as const;
const BLOCK = { keyword: "Bloque", shortcut: "B" } as const;

function pointEntity(
  id: string,
  position: CadPoint2,
  style: number,
  size: number,
  layer: string,
): CadNativeEntity {
  return {
    id,
    type: "point",
    position: { x: position.x, y: position.y, z: 0 },
    // El estilo por defecto (0, el punto pelado) y el tamaño 0 no se escriben:
    // la ausencia ya significa «el de siempre», y materializarlos ensancharía
    // el serializado de todos los puntos del dibujo.
    ...(style !== 0 ? { style } : {}),
    ...(size !== 0 ? { size } : {}),
    layer,
  };
}

// ---------------------------------------------------------------------------
// POINT
// ---------------------------------------------------------------------------

type PointPending = "none" | "style" | "size";

interface PointState {
  style: number;
  size: number;
  pending: PointPending;
  commands: CadEntityCommand[];
}

function pointStep(state: PointState, context: CadCommandContext): CadCommandStep<PointState> {
  if (state.pending === "style")
    return {
      state,
      prompt: {
        // Los mismos códigos que `PDMODE`: 0 punto, 1 nada, 2 cruz, 3 aspa,
        // 4 tick; +32 círculo, +64 cuadrado.
        message: "Precise el estilo de punto (PDMODE)",
        options: [],
        defaultValue: String(state.style),
      },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  if (state.pending === "size")
    return {
      state,
      prompt: {
        message: "Precise el tamaño de la marca (negativo = % del viewport)",
        options: [],
        defaultValue: String(state.size),
      },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  return {
    state,
    prompt: { message: "Precise un punto", options: [STYLE] },
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    preview: context.cursor ? [{ points: [context.cursor] }] : [],
  };
}

function pointFinish(state: PointState): CadCommandStep<PointState> {
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: state.commands.length
      ? { kind: "document", commands: state.commands, label: "POINT" }
      : { kind: "none" },
  };
}

const pointCommand: CadCommandDescriptor<PointState> = {
  name: "POINT",
  aliases: ["PO"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => pointStep({ style: 0, size: 0, pending: "none", commands: [] }, context),
  step: (state, input, context) => {
    if (input.kind === "cancel") return pointFinish(state);
    if (input.kind === "enter") {
      if (state.pending !== "none") return pointStep({ ...state, pending: "none" }, context);
      return pointFinish(state);
    }
    if (input.kind === "keyword" && input.keyword === STYLE.keyword)
      return pointStep({ ...state, pending: "style" }, context);
    if (input.kind === "distance") {
      if (state.pending === "style")
        return pointStep({ ...state, style: Math.trunc(input.value), pending: "size" }, context);
      if (state.pending === "size")
        return pointStep({ ...state, size: input.value, pending: "none" }, context);
      return pointStep(state, context);
    }
    if (input.kind !== "point") return pointStep(state, context);
    return pointStep(
      {
        ...state,
        commands: [
          ...state.commands,
          {
            type: "insert",
            entity: pointEntity(
              context.newEntityId(),
              input.point,
              state.style,
              state.size,
              context.activeLayer,
            ),
          },
        ],
      },
      context,
    );
  },
};

// ---------------------------------------------------------------------------
// DIVIDE y MEASURE
// ---------------------------------------------------------------------------

interface SpreadState {
  entityId: string | null;
  /** `true` en cuanto se elige `Bloque`: la orden termina con un rechazo. */
  rejectedBlock: boolean;
}

/**
 * Camino teselado de la entidad designada, o `null` si no sirve.
 *
 * Se pide al MISMO renderizador que dibuja la entidad, con muchos tramos, para
 * que repartir por longitud de arco sea repartir sobre la curva real y no sobre
 * el polígono de sus vértices.
 */
function tessellatedPath(entityId: string, context: CadCommandContext): CadPoint2[] | null {
  const entity = context.entity?.(entityId);
  if (!entity || !CAD_ENTITY_REGISTRY.supports(entity)) return null;
  const paths = CAD_ENTITY_REGISTRY.adapter(entity).renderer.paths(entity, 512);
  const path = paths[0];
  if (!path || path.points.length < 2) return null;
  // Una entidad cerrada se recorre entera: sin repetir el primer punto al
  // final, DIVIDE sobre una circunferencia se dejaría sin repartir el último
  // tramo, el que va del final al principio.
  return path.closed ? [...path.points, path.points[0]] : [...path.points];
}

function spreadPreview(
  entityId: string,
  context: CadCommandContext,
): { points: CadPoint2[] }[] {
  const path = tessellatedPath(entityId, context);
  return path ? [{ points: path }] : [];
}

function spreadStep(
  state: SpreadState,
  measure: boolean,
  context: CadCommandContext,
): CadCommandStep<SpreadState> {
  if (!state.entityId)
    return {
      state,
      prompt: {
        message: measure ? "Designe el objeto a medir" : "Designe el objeto a dividir",
        options: [],
      },
      accepts: CAD_ACCEPT_ENTITY_PICK,
    };
  return {
    state,
    prompt: {
      message: measure ? "Precise la longitud del segmento" : "Precise el número de segmentos",
      options: [BLOCK],
    },
    accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_KEYWORD,
    // El objeto designado se dibuja resaltado mientras se pide la cuenta: sin
    // eso, quien se equivoca de objeto no se entera hasta ver las marcas.
    preview: spreadPreview(state.entityId, context),
  };
}

function spreadFinish(
  state: SpreadState,
  measure: boolean,
  value: number,
  context: CadCommandContext,
): CadCommandStep<SpreadState> {
  const path = state.entityId ? tessellatedPath(state.entityId, context) : null;
  if (!path)
    return {
      state,
      prompt: { message: "", options: [] },
      accepts: 0,
      result: {
        kind: "message",
        text: "El objeto designado no tiene un recorrido sobre el que repartir marcas.",
      },
    };
  // DIVIDE deja N−1 marcas INTERIORES y MEASURE no marca el origen: en las dos,
  // una marca de más cae en un sitio creíble y nadie la ve sobrar.
  const marks = measure ? measurePath(path, Math.abs(value)) : dividePath(path, Math.round(value));
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: marks.length
      ? {
          kind: "document",
          commands: marks.map((mark) => ({
            type: "insert" as const,
            entity: pointEntity(context.newEntityId(), mark.point, 0, 0, context.activeLayer),
          })),
          label: measure ? "MEASURE" : "DIVIDE",
        }
      : { kind: "none" },
  };
}

function spreadCommand(measure: boolean): CadCommandDescriptor<SpreadState> {
  return {
    name: measure ? "MEASURE" : "DIVIDE",
    aliases: measure ? ["ME"] : ["DIV"],
    kind: "draw",
    transparent: false,
    // `command-first`: la orden pide SIEMPRE el objeto, ignorando lo que
    // hubiera seleccionado, igual que en AutoCAD.
    selection: "command-first",
    repeatable: true,
    mutates: true,
    cursor: "pick",
    begin: (context) => spreadStep({ entityId: null, rejectedBlock: false }, measure, context),
    step: (state, input, context) => {
      if (input.kind === "cancel" || input.kind === "enter")
        return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
      if (input.kind === "entityPick")
        return spreadStep({ ...state, entityId: input.entityId }, measure, context);
      if (input.kind === "keyword" && input.keyword === BLOCK.keyword)
        return {
          state: { ...state, rejectedBlock: true },
          prompt: { message: "", options: [] },
          accepts: 0,
          result: {
            kind: "message",
            text: "Sólo se admiten marcas de PUNTO por ahora; la opción Bloque no está implementada.",
          },
        };
      if (input.kind !== "distance" || !state.entityId) return spreadStep(state, measure, context);
      // DIVIDE con menos de dos partes no divide nada; MEASURE con paso nulo
      // colocaría infinitas marcas.
      if (measure ? !(Math.abs(input.value) > 1e-9) : Math.round(input.value) < 2)
        return {
          state,
          prompt: { message: "", options: [] },
          accepts: 0,
          result: {
            kind: "message",
            text: measure
              ? "La longitud del segmento debe ser mayor que cero."
              : "Un objeto se divide en 2 partes como mínimo.",
          },
        };
      return spreadFinish(state, measure, input.value, context);
    },
  };
}

export const CAD_DRAW_POINT_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(pointCommand),
  asCadCommand(spreadCommand(false)),
  asCadCommand(spreadCommand(true)),
];

export const __testables = { pointEntity, tessellatedPath };
