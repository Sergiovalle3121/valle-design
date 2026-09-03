/**
 * PIDISO: el isométrico de una línea, con su lista de materiales y su hoja.
 *
 * ## Qué cierra, medido
 *
 * `docs/competitive/rubric.json`, criterio `toolset-plant3d.tuberia`: *«…el
 * ruteo 3D por especificación y la generación de isométricos no existen.»* Con
 * `PIDROUTE` ya existe la ruta; ésta es la mitad que la convierte en un
 * ENTREGABLE.
 *
 * ## Un isométrico no es una vista: es una hoja
 *
 * Por eso esta orden no dibuja «unas líneas en diagonal» y se va. Hace las tres
 * cosas que hacen falta para que alguien pueda montar la tubería:
 *
 * 1. el dibujo isométrico con las longitudes VERDADERAS rotuladas y los
 *    accesorios marcados donde caen;
 * 2. la lista de materiales, sacada de la misma geometría;
 * 3. la HOJA, con su ventana encuadrando exactamente las dos cosas.
 *
 * Sin la hoja, el isométrico es geometría en un rincón del modelo que alguien
 * tendría que encuadrar a mano cada vez. Y todo va en UN lote: un paso de
 * deshacer deja el dibujo como estaba, sin hojas huérfanas.
 *
 * ## Se coloca FUERA del modelo, y por qué
 *
 * A la derecha de los límites del dibujo, con un margen. Un isométrico
 * superpuesto a la planta es dos dibujos ilegibles; y como no está a escala, no
 * hay ningún sitio «correcto» donde ponerlo dentro del modelo.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { createCadLayout, cadLayoutId, upsertCadLayoutCommand } from "../../layout/layout-operations";
import { CAD_PL_LINE } from "../../plant/line-numbers";
import { cadPipeRoutesOf } from "../../plant/pipe-route";
import {
  CAD_ISO_PIPE_LAYER,
  CAD_ISO_TEXT_LAYER,
  cadIsoDrawing,
  cadIsoTextHeight,
} from "../../plant/isometric";
import { buildCadPipeMtoTable, cadPipeMto, cadPipeMtoTableSize } from "../../plant/pipe-mto";
import {
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

function entitiesOf(context: CadCommandContext) {
  if (!context.entity) return null;
  return context.entityIds
    .map((id) => context.entity!(id))
    .filter((entity): entity is NonNullable<ReturnType<NonNullable<CadCommandContext["entity"]>>> => !!entity);
}

/** Alto de renglón que trae `scheduleTable`; el cuadro se escala contra él. */
const TABLE_ROW_UNITS = 220;

interface IsoState {
  /** Las líneas con ruta 3D, para poder proponer una por defecto. */
  lines: string[];
}

function isoStep(state: IsoState): CadCommandStep<IsoState> {
  return {
    state,
    prompt: {
      message:
        state.lines.length === 1
          ? `Número de línea, Intro para <${state.lines[0]}>`
          : `Número de línea (${state.lines.length} con ruta 3D: ${state.lines.slice(0, 4).join(", ")}${state.lines.length > 4 ? "…" : ""})`,
      options: [],
    },
    accepts: CAD_ACCEPT_TEXT,
  };
}

const upperTidy = (raw: string): string => raw.trim().toUpperCase().replace(/\s+/gu, "");

function buildIso(line: string, context: CadCommandContext): CadCommandStep<never> {
  const entities = entitiesOf(context);
  if (!entities) return say("PIDISO necesita leer el dibujo: este anfitrión no lo expone.");

  const todas = cadPipeRoutesOf({ entities });
  const mias = todas.filter((route) => upperTidy(route.line) === upperTidy(line));
  if (mias.length === 0) {
    const conEsquema = entities.some(
      (entity) => upperTidy(String(entity.context?.metadata?.[CAD_PL_LINE] ?? "")) === upperTidy(line),
    );
    return say(
      conEsquema
        ? `La línea ${line} sólo tiene el esquema del P&ID, que no está a escala: tiéndala en 3D con PIDROUTE y el isométrico saldrá de ahí.`
        : `No hay ninguna ruta 3D de la línea ${line}. Tienda una con PIDROUTE.`,
    );
  }

  const extents = context.drawingExtents?.() ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const ancho = Math.max(1, extents.maxX - extents.minX);
  const origin: CadPoint2 = { x: extents.maxX + ancho * 0.1, y: extents.minY };

  const unitsPerMetre = context.unit === "mm" ? 1_000 : context.unit === "cm" ? 100 : 1;
  const drawing = cadIsoDrawing({
    routes: mias,
    line: mias[0].line,
    unitsPerMetre,
    origin,
    newEntityId: context.newEntityId,
  });
  if (drawing.entities.length === 0)
    return say(`La ruta de ${line} no tiene geometría que proyectar.`);

  const mto = cadPipeMto({ entities }, { line: mias[0].line, unit: context.unit });
  // El cuadro se escala para que su letra sea la del isométrico: uno a tamaño
  // de modelo junto a otro a tamaño de tabla es un cuadro ilegible.
  const altura = cadIsoTextHeight({
    minX: drawing.bounds.minX,
    minY: drawing.bounds.minY,
    maxX: drawing.bounds.maxX,
    maxY: drawing.bounds.maxY,
  });
  const escala = Math.max(1, (altura * 2) / TABLE_ROW_UNITS);
  const cuadro = cadPipeMtoTableSize(mto, escala);
  const table = buildCadPipeMtoTable(
    mto,
    { x: drawing.bounds.maxX + altura * 2, y: drawing.bounds.maxY },
    CAD_ISO_TEXT_LAYER,
    context.newEntityId,
    escala,
  );

  const commands: CadEntityCommand[] = [];
  const layers = context.layers?.() ?? [];
  for (const [name, color] of [
    [CAD_ISO_PIPE_LAYER, "#38bdf8"],
    [CAD_ISO_TEXT_LAYER, "#e2e8f0"],
  ] as const)
    if (
      !layers.some(
        (layer) => layer.name.toUpperCase() === name || layer.id.toUpperCase() === name,
      )
    )
      commands.push({
        type: "layer",
        op: "upsert",
        layer: { id: name, name, color, visible: true, locked: false },
      });

  for (const entity of drawing.entities)
    commands.push({ type: "insert", entity: entity as never });
  commands.push({ type: "insert", entity: table as never });

  // La hoja encuadra el isométrico Y el cuadro: una ventana que corta la lista
  // de materiales entrega media requisición.
  const spaces = context.paperSpaces?.() ?? [];
  const nombre = `ISO-${mias[0].line}`;
  const modelBounds = {
    x: drawing.bounds.minX,
    y: drawing.bounds.minY,
    width: Math.max(1, drawing.bounds.maxX - drawing.bounds.minX + altura * 2 + cuadro.width),
    height: Math.max(1, drawing.bounds.maxY - drawing.bounds.minY),
  };
  const layout = createCadLayout(spaces, {
    id: cadLayoutId(spaces, nombre),
    name: nombre,
    modelBounds,
    unit: context.unit,
    metadata: {
      project: "-",
      drawingNumber: "-",
      title: `Isométrico ${mias[0].line}`,
      sheetNumber: String(spaces.length + 1),
      revision: "-",
      discipline: "Tubería",
    },
  });
  commands.push(upsertCadLayoutCommand(layout));

  const codos = drawing.fittings.filter((fitting) => fitting.kind === "codo").length;
  const tes = drawing.fittings.filter((fitting) => fitting.kind === "te").length;
  const reducciones = drawing.fittings.filter((fitting) => fitting.kind === "reduccion").length;
  const dicho =
    `PIDISO: isométrico de ${mias[0].line} en la hoja «${layout.name}» — ` +
    `${mto.totalMetres.toFixed(2)} m de tubo, ${codos} codo(s), ${tes} te(s), ${reducciones} reducción(es). ` +
    "Sin escala: las longitudes rotuladas son las verdaderas.";
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "document", commands, label: "PIDISO", notice: dicho },
  };
}

const isoCommand: CadCommandDescriptor<IsoState> = {
  name: "PIDISO",
  aliases: ["ISOMETRICO", "ISOGEN"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "none",
  begin: (context) => {
    const entities = entitiesOf(context);
    if (!entities) return say("PIDISO necesita leer el dibujo: este anfitrión no lo expone.");
    const lines = [...new Set(cadPipeRoutesOf({ entities }).map((route) => route.line))].sort();
    if (lines.length === 0)
      return say(
        "No hay ninguna ruta de tubería 3D en el dibujo. Un isométrico sale de una ruta con cota, no del esquema del P&ID: tienda una con PIDROUTE.",
      );
    return isoStep({ lines });
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("PIDISO cancelado.");
    if (input.kind === "enter") {
      if (state.lines.length !== 1)
        return say(
          `Hay ${state.lines.length} líneas con ruta 3D: teclee cuál (${state.lines.join(", ")}).`,
        );
      return buildIso(state.lines[0], context);
    }
    if (input.kind !== "text" || input.value.trim() === "") return isoStep(state);
    return buildIso(input.value.trim(), context);
  },
};

export const CAD_PLANT_ISO_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(isoCommand)];
