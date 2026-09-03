/**
 * PIDLINE y PIDLIST: la línea de proceso con su número, y la lista de líneas.
 *
 * ## Qué se midió
 *
 * `Plant 3D = 0 %` en el informe del 1 de septiembre, re-medido el 3: catorce
 * nombres de la familia sondeados contra el registro —PLANTPROJECT, PIPESPEC,
 * ISOGEN, PLANTPID, PIDLINE, LINENUMBER, EQUIPMENT, NOZZLE, VALVEADD,
 * INSTRUMENT, SPECEDITOR, PLANTDATAMANAGER, ROUTEPIPE, ISOCONFIG— y **cero
 * aciertos**.
 *
 * ## Por qué el número de línea es lo primero y no los isométricos
 *
 * En una planta una tubería se llama `6"-P-1001-CS150`, y ese nombre es la
 * clave con la que aparece en el P&ID, en el isométrico, en la lista de
 * líneas, en la requisición de material y en la prueba hidrostática. Los
 * isométricos sin números de línea no son un entregable: son dibujos bonitos.
 * Se empieza por la clave.
 *
 * ## La especificación es del CLIENTE
 *
 * No se trae ningún catálogo: cada ingeniería tiene el suyo y el ajeno además
 * tiene dueño. Lo que `PIDLIST` comprueba es lo universal —número repetido,
 * un servicio con dos especificaciones, diámetro que no se compra, número
 * ilegible— y para eso no hace falta el catálogo de nadie.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntity } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import {
  CAD_PL_LINE_LAYER,
  cadFormatPlantLine,
  cadNextPlantLineNumber,
  cadParsePlantLine,
  cadPlantFindings,
  cadPlantLineMetadata,
  cadPlantLinesOf,
  cadPlantRunLength,
} from "../../plant/line-numbers";
import {
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const say = (text: string): CadCommandStep<never> => ({
  state: undefined as never,
  prompt: { message: "", options: [] },
  accepts: 0,
  result: { kind: "message", text },
});

function entitiesOf(context: CadCommandContext): CadEntity[] | null {
  if (!context.entity) return null;
  return context.entityIds
    .map((id) => context.entity!(id))
    .filter((entity): entity is CadEntity => !!entity);
}

// ---------------------------------------------------------------------------
// PIDLINE
// ---------------------------------------------------------------------------

interface LineState {
  size: string | null;
  service: string | null;
  spec: string | null;
  points: CadPoint2[];
}

function lineStep(state: LineState): CadCommandStep<LineState> {
  if (!state.size)
    return {
      state,
      prompt: { message: 'Diámetro nominal, con su comilla (6", 1-1/2")', options: [] },
      accepts: CAD_ACCEPT_TEXT,
    };
  if (!state.service)
    return {
      state,
      prompt: { message: "Servicio (P proceso, V vapor, A agua…), una a tres letras", options: [] },
      accepts: CAD_ACCEPT_TEXT,
    };
  if (!state.spec)
    return {
      state,
      prompt: { message: "Especificación de tubería del proyecto (CS150, SS300…)", options: [] },
      accepts: CAD_ACCEPT_TEXT,
    };
  return {
    state,
    prompt: {
      message:
        state.points.length === 0
          ? "Precise el origen de la línea"
          : "Precise el siguiente punto, Intro para terminar",
      options: [],
    },
    accepts: CAD_ACCEPT_POINT,
    ...(state.points.length > 0 ? { preview: [{ points: state.points }] } : {}),
  };
}

function finishLine(
  state: LineState,
  context: CadCommandContext,
): CadCommandStep<never> {
  const entities = entitiesOf(context);
  if (!entities) return say("PIDLINE necesita leer el dibujo para numerar: este anfitrión no lo expone.");
  if (state.points.length < 2)
    return say("Una línea necesita al menos dos puntos: no se traza un punto.");

  const number = cadNextPlantLineNumber({ entities }, state.service!);
  const linea = cadFormatPlantLine(state.size!, state.service!, number, state.spec!);
  // El número se compone ANTES de escribir y se valida con el mismo lector que
  // usa la lista: si el diámetro o el servicio no tienen forma, la línea no se
  // dibuja a medias — se dice qué está mal.
  if (!cadParsePlantLine(linea))
    return say(
      `«${linea}» no es un número de línea válido: revise el diámetro (con su comilla) y el servicio (una a tres letras).`,
    );

  const commands: CadEntityCommand[] = [];
  const layers = context.layers?.();
  if (
    layers &&
    !layers.some(
      (layer) =>
        layer.name.toUpperCase() === CAD_PL_LINE_LAYER ||
        layer.id.toUpperCase() === CAD_PL_LINE_LAYER,
    )
  )
    commands.push({
      type: "layer",
      op: "upsert",
      layer: {
        id: CAD_PL_LINE_LAYER,
        name: CAD_PL_LINE_LAYER,
        color: "#22d3ee",
        visible: true,
        locked: false,
      },
    });
  commands.push({
    type: "insert",
    entity: {
      id: context.newEntityId(),
      type: "polyline",
      vertices: state.points.map((point) => ({ x: point.x, y: point.y, z: 0 })),
      closed: false,
      layer: CAD_PL_LINE_LAYER,
      context: {
        metadata: cadPlantLineMetadata({
          size: state.size!,
          service: state.service!,
          number,
          spec: state.spec!,
        }),
      },
    } as never,
  });

  const dicho = `PIDLINE: ${linea}, ${state.points.length} punto(s) en ${CAD_PL_LINE_LAYER}`;
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "document", commands, label: "PIDLINE", notice: dicho },
  };
}

const lineCommand: CadCommandDescriptor<LineState> = {
  name: "PIDLINE",
  aliases: ["LINEAPROCESO", "LINENUMBER"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => lineStep({ size: null, service: null, spec: null, points: [] }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("PIDLINE cancelado.");
    if (!state.size) {
      if (input.kind !== "text" || input.value.trim() === "")
        return say('PIDLINE necesita el diámetro nominal, con su comilla: 6", 1-1/2".');
      return lineStep({ ...state, size: input.value.trim() });
    }
    if (!state.service) {
      if (input.kind !== "text" || input.value.trim() === "")
        return say("PIDLINE necesita el servicio: sin él, un número no identifica nada.");
      return lineStep({ ...state, service: input.value.trim() });
    }
    if (!state.spec) {
      if (input.kind !== "text" || input.value.trim() === "")
        return say(
          "PIDLINE necesita la especificación del proyecto: es la que dice qué material se compra.",
        );
      return lineStep({ ...state, spec: input.value.trim() });
    }
    if (input.kind === "point")
      return lineStep({ ...state, points: [...state.points, input.point] });
    if (input.kind === "enter") return finishLine(state, context);
    return lineStep(state);
  },
};

// ---------------------------------------------------------------------------
// PIDLIST
// ---------------------------------------------------------------------------

const FINDING_WORD: Record<string, string> = {
  "numero-repetido": "NÚMERO REPETIDO",
  "servicio-con-dos-especificaciones": "DOS ESPECIFICACIONES",
  "diametro-no-comercial": "DIÁMETRO NO COMERCIAL",
  "numero-ilegible": "NÚMERO ILEGIBLE",
};

const listCommand: CadCommandDescriptor<never> = {
  name: "PIDLIST",
  aliases: ["LISTALINEAS", "PLANTDATAMANAGER"],
  kind: "inquiry",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: (context) => {
    const entities = entitiesOf(context);
    if (!entities) return say("PIDLIST necesita leer el dibujo: este anfitrión no lo expone.");
    const lines = cadPlantLinesOf({ entities });
    const findings = cadPlantFindings({ entities });
    if (lines.length === 0 && findings.length === 0)
      return say("No hay ninguna línea de proceso en el dibujo. Trace una con PIDLINE.");

    // La longitud sale del PLANO: un P&ID de AutoCAD no está a escala y no
    // puede darla, así que el metrado se hace aparte. Aquí es una suma.
    const porNumero = new Map<string, number>();
    for (const line of lines) {
      const entity = entities.find((busca) => busca.id === line.entityId);
      porNumero.set(
        line.line,
        (porNumero.get(line.line) ?? 0) + (entity ? cadPlantRunLength(entity) : 0),
      );
    }
    const unidadesPorMetro = context.unit === "mm" ? 1_000 : context.unit === "cm" ? 100 : 1;
    const renglones = [...porNumero.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([linea, largo]) => `${linea} (${(largo / unidadesPorMetro).toFixed(1)} m)`);

    const partes = [`${lines.length} línea(s): ${renglones.join(" · ")}`];
    if (findings.length > 0)
      partes.push(
        findings
          .map((hallazgo) => `${FINDING_WORD[hallazgo.kind] ?? hallazgo.kind}: ${hallazgo.detail}`)
          .join("; "),
      );
    else partes.push("sin hallazgos");
    // El límite: lo que se comprueba NO incluye la especificación del cliente.
    partes.push(
      "Se comprueba la forma del número, los repetidos, el diámetro comercial y que un servicio no use dos especificaciones. NO se comprueba contra el catálogo del proyecto: ése lo aprueba la ingeniería.",
    );
    return say(`PIDLIST — ${partes.join(". ")}`);
  },
  step: (state) => ({
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "none" },
  }),
};

export const CAD_PLANT_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(lineCommand),
  asCadCommand(listCommand),
];
