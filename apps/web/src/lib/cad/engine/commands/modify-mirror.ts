/**
 * MIRROR.
 *
 * El comando que no existía y que no podía existir: hasta ahora
 * `CadEntityTransform` sólo sabía de traslación, giro y escala uniforme, y una
 * reflexión tiene determinante negativo — no se escribe con ninguna
 * combinación de las tres. Lo que faltaba no era el comando, era el
 * vocabulario.
 *
 * ## Lo que MIRROR pide, y por qué en ese orden
 *
 * Se designan objetos, se precisan **dos puntos del eje**, y se decide si el
 * original se borra. El defecto es conservarlo, que es el de AutoCAD y el
 * prudente: espejar es casi siempre duplicar —el ala simétrica de una planta,
 * la otra mitad de una pieza— y no una operación destructiva.
 *
 * ## MIRRTEXT
 *
 * En AutoCAD, la variable `MIRRTEXT` decide si el texto se refleja de verdad
 * (ilegible, en espejo) o sólo cambia de sitio conservando su legibilidad. El
 * valor por defecto desde 2000 es `0`: **el texto no se refleja**, y es lo que
 * espera cualquiera que espeje una planta acotada. Aquí no hay variable de
 * sistema todavía, así que se implementa el comportamiento por defecto y se
 * dice: los adaptadores de MTEXT y MLEADER re-orientan el rótulo con
 * `φ − rotación`, que lo deja leyéndose del derecho.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const ERASE_SOURCE = { keyword: "Sí", shortcut: "S" } as const;
const KEEP_SOURCE = { keyword: "No", shortcut: "N" } as const;

interface MirrorState {
  selection: readonly string[];
  first: CadPoint2 | null;
  second: CadPoint2 | null;
}

const EMPTY: MirrorState = { selection: [], first: null, second: null };

function step(state: MirrorState): CadCommandStep<MirrorState> {
  if (state.selection.length === 0)
    return {
      state,
      prompt: { message: "Designe objetos", options: [] },
      accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
    };
  if (!state.first)
    return {
      state,
      prompt: { message: "Precise el primer punto del eje de simetría", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  if (!state.second)
    return {
      state,
      prompt: { message: "Precise el segundo punto del eje de simetría", options: [] },
      accepts: CAD_ACCEPT_POINT,
      preview: [{ points: [state.first, state.first] }],
    };
  return {
    state,
    prompt: {
      message: "¿Borrar los objetos de origen?",
      options: [ERASE_SOURCE, KEEP_SOURCE],
      defaultOption: KEEP_SOURCE.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

function done(
  commands: readonly CadEntityCommand[],
  message?: string,
): CadCommandStep<MirrorState> {
  return {
    state: EMPTY,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: message
      ? { kind: "message", text: message }
      : commands.length > 0
        ? { kind: "document", commands, label: "MIRROR" }
        : { kind: "none" },
  };
}

/**
 * El lote.
 *
 * Conservando el original, cada objeto se **copia y luego se refleja**: el
 * duplicado lleva la reflexión y el original no se toca. Al revés —reflejar y
 * copiar después— dejaría los dos ejemplares reflejados y ninguno en su sitio,
 * que es el error clásico de esta orden.
 */
function mirrorCommands(state: MirrorState, erase: boolean, context: CadCommandContext) {
  const mirror = {
    point: state.first!,
    direction: { x: state.second!.x - state.first!.x, y: state.second!.y - state.first!.y },
  };
  const commands: CadEntityCommand[] = [];
  for (const entityId of state.selection) {
    const target = erase ? entityId : context.newEntityId();
    if (!erase) commands.push({ type: "copy", entityId, newEntityId: target });
    commands.push({ type: "transform", entityId: target, transform: { mirror } });
  }
  return commands;
}

const mirrorCommand: CadCommandDescriptor<MirrorState> = {
  name: "MIRROR",
  aliases: ["MI"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => step({ ...EMPTY, selection: context.selection }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return done([]);

    if (input.kind === "selection") return step({ ...state, selection: input.entityIds });
    if (input.kind === "entityPick")
      return step({
        ...state,
        selection: [...new Set([...state.selection, input.entityId])],
      });

    if (input.kind === "enter") {
      if (state.selection.length === 0)
        return done([], "MIRROR necesita al menos un objeto designado.");
      // Enter en el último paso acepta el defecto: conservar el original.
      if (state.first && state.second) return done(mirrorCommands(state, false, context));
      return step(state);
    }

    if (input.kind === "keyword") {
      if (!state.first || !state.second) return step(state);
      return done(mirrorCommands(state, input.keyword === ERASE_SOURCE.keyword, context));
    }

    if (input.kind !== "point") return step(state);
    if (!state.first) return step({ ...state, first: input.point });
    // Un eje necesita dos puntos DISTINTOS. Con dos iguales la dirección es
    // nula, la reflexión queda indefinida y `cadAffineReflection` produciría
    // una matriz degenerada que colapsaría la geometría a una recta.
    if (Math.hypot(input.point.x - state.first.x, input.point.y - state.first.y) < 1e-9)
      return done([], "Los dos puntos del eje son el mismo: no definen una simetría.");
    return step({ ...state, second: input.point });
  },
};

export const CAD_MIRROR_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(mirrorCommand),
];
