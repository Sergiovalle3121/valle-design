/**
 * WALL: el muro paramétrico como comando del motor.
 *
 * Primera orden BIM del producto. Se teclea como LINE —punto a punto, con el
 * lote emitido al terminar— pero cada tramo da de alta una entidad `wall` que
 * persiste su RECETA (eje, grosor, altura), no su contorno. `Grosor` y
 * `Altura` se cambian en cualquier momento con su palabra clave y afectan a
 * los tramos SIGUIENTES: los ya colocados conservan lo que tenían al
 * colocarse, que es lo que hace AutoCAD Architecture y lo único predecible
 * cuando se dibuja una planta con muros de dos grosores.
 *
 * ## Los valores por defecto se atan a la unidad del documento
 *
 * Un tabique de 200 y una altura de 2400 sólo significan algo en milímetros.
 * El mismo muro en un documento en metros es 0,2 × 2,4: si el default fuera un
 * número pelado, cambiar la unidad del documento convertiría el primer muro
 * tecleado en una losa de 200 m de grosor. La conversión vive aquí y no en la
 * entidad porque el documento persiste NÚMEROS en su unidad, no milímetros.
 *
 * ## La previsualización ES la geometría final
 *
 * El contorno bajo el cursor sale de `wallFootprint`, la misma función que
 * consumirá el adaptador al dibujar la entidad. Una previsualización que
 * enseñara sólo el eje convertiría el grosor en una sorpresa al soltar.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import { wallFootprint } from "../../wall-geometry";
import { cadFromMillimetres } from "./architecture-support";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
  type CadPreviewPath,
} from "../command-types";

const THICKNESS = { keyword: "Grosor", shortcut: "G" } as const;
const HEIGHT = { keyword: "Altura", shortcut: "A" } as const;
const UNDO = { keyword: "desHacer", shortcut: "H" } as const;
const CLOSE = { keyword: "Cerrar", shortcut: "C" } as const;

/** Tabique de 200 mm expresado en la unidad del documento. */
export function defaultWallThickness(unit: string | undefined): number {
  return cadFromMillimetres(200, unit);
}

/** Altura de planta de 2400 mm expresada en la unidad del documento. */
export function defaultWallHeight(unit: string | undefined): number {
  return cadFromMillimetres(2400, unit);
}

interface WallState {
  /** Vértices del eje ya fijados. El motor lee `points` para `@relativo`. */
  points: CadPoint2[];
  commands: CadEntityCommand[];
  thickness: number;
  height: number;
  pending: "none" | "thickness" | "height";
}

function wallEntity(
  state: WallState,
  a: CadPoint2,
  b: CadPoint2,
  context: CadCommandContext,
): CadNativeEntity {
  return {
    id: context.newEntityId(),
    type: "wall",
    start: { x: a.x, y: a.y, z: 0 },
    end: { x: b.x, y: b.y, z: 0 },
    thickness: state.thickness,
    height: state.height,
    layer: context.activeLayer,
  };
}

/** Contornos de los tramos ya colocados más el tramo vivo bajo el cursor. */
function wallPreview(state: WallState, cursor: CadPoint2 | undefined): CadPreviewPath[] {
  const paths: CadPreviewPath[] = [];
  for (let index = 1; index < state.points.length; index += 1) {
    const footprint = wallFootprint({
      start: { ...state.points[index - 1], z: 0 },
      end: { ...state.points[index], z: 0 },
      thickness: state.thickness,
    });
    if (footprint) paths.push({ points: footprint, closed: true });
  }
  const last = state.points[state.points.length - 1];
  if (last && cursor) {
    const live = wallFootprint({
      start: { ...last, z: 0 },
      end: { ...cursor, z: 0 },
      thickness: state.thickness,
    });
    if (live) paths.push({ points: live, closed: true });
  }
  return paths;
}

function wallStep(state: WallState, context: CadCommandContext): CadCommandStep<WallState> {
  if (state.pending === "thickness")
    return {
      state,
      prompt: {
        message: "Precise el grosor del muro",
        options: [],
        defaultValue: String(state.thickness),
      },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  if (state.pending === "height")
    return {
      state,
      prompt: {
        message: "Precise la altura del muro",
        options: [],
        defaultValue: String(state.height),
      },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  if (state.points.length === 0)
    return {
      state,
      prompt: { message: "Precise el punto inicial del muro", options: [THICKNESS, HEIGHT] },
      accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    };
  const options =
    state.points.length >= 3
      ? [THICKNESS, HEIGHT, CLOSE, UNDO]
      : [THICKNESS, HEIGHT, UNDO];
  return {
    state,
    prompt: { message: "Precise el punto siguiente", options },
    // Sin `CAD_ACCEPT_DISTANCE` a propósito, como en LINE: un número suelto
    // aquí es entrada directa sobre la dirección del cursor y la resuelve el
    // pipeline; declararla se la comería antes.
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    preview: wallPreview(state, context.cursor),
  };
}

function finishWall(state: WallState): CadCommandStep<WallState> {
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result:
      state.commands.length > 0
        ? { kind: "document", commands: state.commands, label: "WALL" }
        : { kind: "none" },
  };
}

const wallCommand: CadCommandDescriptor<WallState> = {
  name: "WALL",
  aliases: ["WA", "MURO"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) =>
    wallStep(
      {
        points: [],
        commands: [],
        thickness: defaultWallThickness(context.unit),
        height: defaultWallHeight(context.unit),
        pending: "none",
      },
      context,
    ),
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    if (input.kind === "enter") {
      // Enter sobre una petición de valor acepta el valor vigente, que el
      // prompt enseña entre ángulos; sobre la petición de puntos, termina.
      if (state.pending !== "none") return wallStep({ ...state, pending: "none" }, context);
      return finishWall(state);
    }

    if (input.kind === "keyword") {
      if (input.keyword === THICKNESS.keyword)
        return wallStep({ ...state, pending: "thickness" }, context);
      if (input.keyword === HEIGHT.keyword)
        return wallStep({ ...state, pending: "height" }, context);
      if (input.keyword === UNDO.keyword) {
        // Retira el último vértice Y el tramo que creó, como LINE: sin retirar
        // ambos, el muro quedaría huérfano en el lote.
        const points = state.points.slice(0, -1);
        const commands = state.commands.slice(0, Math.max(0, state.commands.length - 1));
        return wallStep({ ...state, points, commands }, context);
      }
      if (input.keyword === CLOSE.keyword) {
        if (state.points.length < 3) return wallStep(state, context);
        const last = state.points[state.points.length - 1];
        const first = state.points[0];
        return finishWall({
          ...state,
          commands: [
            ...state.commands,
            { type: "insert", entity: wallEntity(state, last, first, context) },
          ],
        });
      }
      return wallStep(state, context);
    }

    if (input.kind === "distance") {
      const value = Math.abs(input.value);
      // Un grosor o una altura cero no fabrican un muro degenerado: se ignora
      // el valor y se conserva el vigente, que el prompt ya enseñaba.
      if (state.pending === "thickness")
        return wallStep(
          { ...state, thickness: value > 1e-9 ? value : state.thickness, pending: "none" },
          context,
        );
      if (state.pending === "height")
        return wallStep(
          { ...state, height: value > 1e-9 ? value : state.height, pending: "none" },
          context,
        );
      return wallStep(state, context);
    }

    if (input.kind !== "point" || state.pending !== "none") return wallStep(state, context);

    const points = [...state.points, input.point];
    if (points.length === 1) return wallStep({ ...state, points }, context);
    const previous = points[points.length - 2];
    // Un clic repetido en el mismo sitio no crea un muro de eje nulo.
    if (Math.hypot(input.point.x - previous.x, input.point.y - previous.y) < 1e-9)
      return wallStep(state, context);
    return wallStep(
      {
        ...state,
        points,
        commands: [
          ...state.commands,
          { type: "insert", entity: wallEntity(state, previous, input.point, context) },
        ],
      },
      context,
    );
  },
};

export const CAD_DRAW_WALL_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(wallCommand),
];
