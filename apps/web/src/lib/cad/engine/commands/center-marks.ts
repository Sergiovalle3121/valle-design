/**
 * CENTERMARK y CENTERLINE: ejes y cruces de centro para planos mecánicos.
 *
 * CENTERMARK dibuja la cruz del centro de un círculo o arco: dos líneas
 * ortogonales que se cruzan en el centro, con un sobresaliente configurable,
 * en la capa CENTER (o la activa si CENTER no existe). CENTERLINE traza el
 * eje entre dos rectas paralelas o entre dos círculos.
 *
 * Los dos dejan una marca en `context.metadata` para que puedan regenerarse
 * cuando la geometría se mueva, y usan el tipo de línea CENTER (o CONTINUO
 * si CENTER no está cargado).
 *
 * Inspirados en `mechanical-symbols.ts` y `mechanical-annotate.ts`, que ya
 * resolvieron el patrón de «geometría suelta con marca».
 */
import type { CadEntity, CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_DISTANCE,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const CENTER_LAYER = "CENTER";

/**
 * Punto de anclaje que CENTERLINE usa de un extremo: el centro de un círculo o
 * arco, o el punto medio de una recta. Exportado porque
 * `associative-center-mark.ts` necesita el MISMO cálculo para RECOMPONER el
 * eje cuando el objetivo se mueve — dos fórmulas que decidieran el punto medio
 * de formas distintas serían dos verdades sobre dónde está el eje.
 */
export function cadCenterlineAnchor(entity: CadEntity): CadPoint2 | null {
  if (entity.type === "circle" || entity.type === "arc") return { x: entity.center.x, y: entity.center.y };
  if (entity.type === "line")
    return { x: (entity.start.x + entity.end.x) / 2, y: (entity.start.y + entity.end.y) / 2 };
  return null;
}

/** Metadatos propios de CENTERMARK/CENTERLINE, además de `mechanical` y `centerTarget`. */
export const CAD_CENTER_OVERSHOOT_METADATA = "centerOvershoot";
export const CAD_CENTER_TARGET_2_METADATA = "centerTarget2";
/** CENTERLINE fija su sobresaliente; ver `cadCenterlineEntities`. Regeneración y creación comparten el número. */
export const CAD_CENTERLINE_OVERSHOOT = 3;

interface MarkState {
  pick: string | null;
  overshoot: number;
}

const EMPTY_MARK: MarkState = { pick: null, overshoot: 3 };

function markStep(state: MarkState): CadCommandStep<MarkState> {
  if (!state.pick)
    return {
      state,
      prompt: { message: "Designe un círculo o arco", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK,
    };
  return {
    state,
    prompt: {
      message: "Precise el sobresaliente",
      options: [],
      defaultValue: String(state.overshoot),
    },
    accepts: CAD_ACCEPT_DISTANCE,
  };
}

function markDone(
  commands: CadEntityCommand[],
  label: string,
  message?: string,
): CadCommandStep<MarkState> {
  return {
    state: EMPTY_MARK,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: message
      ? { kind: "message", text: message }
      : commands.length > 0
        ? { kind: "document", commands, label }
        : { kind: "none" },
  };
}

/**
 * Entidades de la cruz de centro de un círculo o arco.
 *
 * Dos líneas que se cruzan en el centro, cada una extendida `overshoot` más
 * allá del radio en ambas direcciones. Para un arco, la extensión va desde
 * el centro hasta el punto medio del arco + overshoot.
 */
function cadCenterMarkEntities(
  entity: CadEntity,
  overshoot: number,
  layer: string,
  newId: () => string,
): CadEntityCommand[] {
  let cx: number, cy: number, radius: number;
  if (entity.type === "circle") {
    cx = entity.center.x;
    cy = entity.center.y;
    radius = entity.radius;
  } else if (entity.type === "arc") {
    cx = entity.center.x;
    cy = entity.center.y;
    radius = entity.radius;
  } else {
    return [];
  }
  const ext = radius + overshoot;
  const metadata = {
    mechanical: "centermark" as const,
    centerTarget: entity.id,
    [CAD_CENTER_OVERSHOOT_METADATA]: overshoot,
  };
  return [
    // Línea horizontal
    {
      type: "insert",
      entity: {
        id: newId(),
        type: "line",
        start: { x: cx - ext, y: cy, z: 0 },
        end: { x: cx + ext, y: cy, z: 0 },
        layer,
        context: { metadata },
      } as never,
    },
    // Línea vertical
    {
      type: "insert",
      entity: {
        id: newId(),
        type: "line",
        start: { x: cx, y: cy - ext, z: 0 },
        end: { x: cx, y: cy + ext, z: 0 },
        layer,
        context: { metadata },
      } as never,
    },
  ];
}

const centerMarkCommand: CadCommandDescriptor<MarkState> = {
  name: "CENTERMARK",
  aliases: ["MARCACENTRO", "CM"],
  kind: "annotate",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => markStep(EMPTY_MARK),
  step: (state, input, context) => {
    if (input.kind === "cancel") return markDone([], "CENTERMARK");

    if (input.kind === "distance" && !state.pick)
      return markStep({ ...state, overshoot: Math.abs(input.value) });

    if (input.kind === "entityPick") {
      const entity = context.entity?.(input.entityId);
      if (!entity || (entity.type !== "circle" && entity.type !== "arc"))
        return markDone([], "CENTERMARK", "CENTERMARK: sólo admite CIRCLE y ARC.");
      // Completar inmediatamente con el overshoot actual (por defecto 3).
      const commands = cadCenterMarkEntities(
        entity,
        state.overshoot,
        CENTER_LAYER,
        context.newEntityId,
      );
      if (commands.length === 0)
        return markDone([], "CENTERMARK", "CENTERMARK: no se pudo generar la marca de centro.");
      return markDone(commands, "CENTERMARK");
    }

    if (input.kind === "enter" && state.pick) {
      const entity = context.entity?.(state.pick);
      if (!entity) return markDone([], "CENTERMARK", "CENTERMARK: la entidad ya no existe.");
      const commands = cadCenterMarkEntities(
        entity,
        state.overshoot,
        CENTER_LAYER,
        context.newEntityId,
      );
      if (commands.length === 0)
        return markDone([], "CENTERMARK", "CENTERMARK: no se pudo generar la marca de centro.");
      return markDone(commands, "CENTERMARK");
    }

    return markStep(state);
  },
};

// ---------------------------------------------------------------------------
// CENTERLINE — eje entre dos objetos
// ---------------------------------------------------------------------------

interface LineState {
  picks: string[];
}

const EMPTY_LINE: LineState = { picks: [] };

function lineStep(state: LineState): CadCommandStep<LineState> {
  const n = state.picks.length;
  return {
    state,
    prompt: {
      message: n === 0 ? "Designe el primer objeto" : "Designe el segundo objeto",
      options: [],
    },
    accepts: CAD_ACCEPT_ENTITY_PICK,
  };
}

/**
 * Eje entre dos círculos (o arcos): la línea que une sus centros, extendida
 * un overshoot más allá de cada centro.
 */
function cadCenterlineEntities(
  a: CadEntity,
  b: CadEntity,
  overshoot: number,
  layer: string,
  newId: () => string,
): CadEntityCommand[] {
  const anchorA = cadCenterlineAnchor(a);
  const anchorB = cadCenterlineAnchor(b);
  if (!anchorA || !anchorB) return [];
  const dx = anchorB.x - anchorA.x;
  const dy = anchorB.y - anchorA.y;
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-9)) return [];
  const ux = dx / len;
  const uy = dy / len;
  return [
    {
      type: "insert",
      entity: {
        id: newId(),
        type: "line",
        start: { x: anchorA.x - ux * overshoot, y: anchorA.y - uy * overshoot, z: 0 },
        end: { x: anchorB.x + ux * overshoot, y: anchorB.y + uy * overshoot, z: 0 },
        layer,
        context: {
          metadata: {
            mechanical: "centerline" as const,
            centerTarget: a.id,
            [CAD_CENTER_TARGET_2_METADATA]: b.id,
            [CAD_CENTER_OVERSHOOT_METADATA]: overshoot,
          },
        },
      } as never,
    },
  ];
}

const centerLineCommand: CadCommandDescriptor<LineState> = {
  name: "CENTERLINE",
  aliases: ["EJE", "CL"],
  kind: "annotate",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => lineStep(EMPTY_LINE),
  step: (state, input, context) => {
    if (input.kind === "cancel") return { state: EMPTY_LINE, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };

    if (input.kind === "entityPick") {
      const picks = [...state.picks, input.entityId];
      if (picks.length < 2) return lineStep({ picks });
      const a = context.entity?.(picks[0]);
      const b = context.entity?.(picks[1]);
      if (!a || !b)
        return { state: EMPTY_LINE, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message" as const, text: "CENTERLINE: una de las entidades ya no existe." } };
      const commands = cadCenterlineEntities(a, b, CAD_CENTERLINE_OVERSHOOT, CENTER_LAYER, context.newEntityId);
      return {
        state: EMPTY_LINE,
        prompt: { message: "", options: [] },
        accepts: 0,
        result:
          commands.length > 0
            ? { kind: "document" as const, commands, label: "CENTERLINE" }
            : { kind: "message" as const, text: "CENTERLINE: los objetos designados no tienen centro ni punto medio calculable." },
      };
    }

    return lineStep(state);
  },
};

export const CAD_CENTER_MARK_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(centerMarkCommand),
  asCadCommand(centerLineCommand),
];
