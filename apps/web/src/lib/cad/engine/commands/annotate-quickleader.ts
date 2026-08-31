/**
 * QLEADER: una directriz con su nota en tres golpes, sin el menú de opciones
 * de MLEADER.
 *
 * ## El límite, dicho antes que el código
 *
 * Esto crea UNA directriz recta de un tramo, NO asociativa
 * (`associationStatus: "detached"`) y con el remate y el largo de acodo fijos
 * de fábrica. `MLEADER` (otra orden, ya existente en
 * `annotate-leaders.ts`) sigue siendo la que ofrece varios tramos, engancha
 * a un objeto y deja elegir remate/estilo; QLEADER es la mitad rápida para
 * la nota suelta que no necesita nada de eso. Fingir asociatividad aquí sería
 * peor que no tenerla: una directriz «enganchada» que en realidad no sigue a
 * nada es la clase de mentira que este documento entero existe para evitar.
 */
import type { CadNativeEntity } from "../../entity-runtime";
import { cadCommandCancelled, cadCommandRefused, cadCommandWrites, flat } from "./annotate-support";
import {
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadPrompt,
} from "../command-types";
import type { CadPoint2 } from "../../cad-document";

const DOGLEG_LENGTH = 8;

interface QleaderState {
  first?: CadPoint2;
  second?: CadPoint2;
}

const askFirst: CadPrompt = { message: "Punto de arranque de la directriz", options: [] };
const askSecond: CadPrompt = { message: "Punto de destino, donde queda el texto", options: [] };
const askText: CadPrompt = { message: "Texto de la nota", options: [] };

const qleaderCommand: CadCommandDescriptor<QleaderState> = {
  name: "QLEADER",
  aliases: ["QL"],
  kind: "annotate",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => ({ state: {}, prompt: askFirst, accepts: CAD_ACCEPT_POINT }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);

    if (!state.first) {
      if (input.kind !== "point") return { state, prompt: askFirst, accepts: CAD_ACCEPT_POINT };
      return { state: { first: input.point }, prompt: askSecond, accepts: CAD_ACCEPT_POINT };
    }

    if (!state.second) {
      if (input.kind !== "point") return { state, prompt: askSecond, accepts: CAD_ACCEPT_POINT };
      return { state: { ...state, second: input.point }, prompt: askText, accepts: CAD_ACCEPT_TEXT };
    }

    if (input.kind !== "text") return { state, prompt: askText, accepts: CAD_ACCEPT_TEXT };
    const text = input.value.trim();
    if (!text) return cadCommandRefused(state, "QLEADER necesita un texto para la nota; no se hizo nada.");

    const entity: CadNativeEntity = {
      id: context.newEntityId(),
      type: "mleader",
      vertices: [flat(state.first), flat(state.second)],
      leaderLines: [[flat(state.first), flat(state.second)]],
      text,
      textPosition: flat(state.second),
      contentType: "text",
      landing: true,
      doglegLength: DOGLEG_LENGTH,
      arrowhead: "closed-filled",
      associationStatus: "detached",
      associative: false,
      style: "Standard",
      layer: context.activeLayer,
    } as CadNativeEntity;
    return cadCommandWrites(state, [{ type: "insert", entity }], "QLEADER");
  },
};

export const CAD_QLEADER_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(qleaderCommand)];
