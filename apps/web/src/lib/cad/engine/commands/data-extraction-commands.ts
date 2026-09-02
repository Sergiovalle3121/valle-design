/**
 * DATAEXTRACTION: el cuadro de cantidades del modelo, a tabla o a CSV.
 *
 * `bim-schedule.ts` ya calculaba las dos tablas —muro y carpintería, cuadro de
 * áreas— desde la ola 6/7, y `TABLE` ya sabía insertar una rejilla vacía desde
 * la anotación v4. Lo que faltaba era la orden que las junta: llenar esa
 * rejilla con números reales del dibujo abierto, en vez de dejar que alguien
 * los teclee celda a celda.
 *
 * Dos salidas, una orden: `Tabla` inserta la tabla de muros en el punto
 * indicado (un lote, un paso de deshacer, como todo lo que muta). `CSV`
 * entrega las TRES tablas —muro, carpintería, locales— a un anfitrión que
 * sepa descargar archivos; el propio comando compone el texto, así que se
 * prueba en Node comparando la cadena, igual que hace DXFOUT.
 */
import { buildCadBimSchedule } from "../../bim-schedule";
import {
  buildCadDataExtractionCsv,
  buildCadDataExtractionTable,
  buildCadOpeningScheduleTable,
  buildCadRoomScheduleTable,
} from "../../data-extraction/data-extraction";
import {
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import { cadCommandCancelled, cadCommandRefused, cadCommandWrites } from "./annotate-support";

const NO_DOCUMENT_VIEW =
  "Este espacio de trabajo no expone el documento entero: DATAEXTRACTION no puede leer el cuadro de cantidades aquí.";

// Tres cuadros y el CSV (Ola E, 2026-09-02): `Tabla` sigue siendo el de
// muros; `Superficies` es el cuadro de áreas con el nombre de cada local y
// `carPintería` el de puertas y ventanas. Los tres salen en la lámina.
const OUTPUT_OPTIONS = [
  { keyword: "Tabla", shortcut: "T" },
  { keyword: "Superficies", shortcut: "S" },
  { keyword: "carPintería", shortcut: "P" },
  { keyword: "CSV", shortcut: "C" },
] as const;

interface DataExtractionState {
  output: "table" | "rooms" | "openings" | "csv" | null;
}

const TABLE_NAMES = { table: "la tabla de muros", rooms: "el cuadro de superficies", openings: "el cuadro de carpintería" } as const;

function ask(state: DataExtractionState): CadCommandStep<DataExtractionState> {
  if (state.output === "table" || state.output === "rooms" || state.output === "openings")
    return {
      state,
      prompt: { message: `Precise el punto de inserción de ${TABLE_NAMES[state.output]}`, options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  return {
    state,
    prompt: {
      message: "Indique la salida",
      options: OUTPUT_OPTIONS,
      defaultOption: "Tabla",
    },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

const dataExtractionCommand: CadCommandDescriptor<DataExtractionState> = {
  name: "DATAEXTRACTION",
  aliases: ["DX"],
  kind: "annotate",
  transparent: false,
  selection: "none",
  repeatable: true,
  // Mutante en la variante Tabla, no en CSV — pero el contrato del comando es
  // uno solo, y la variante que escribe es la que decide `mutates`: un CSV que
  // no escribe nada sigue siendo correcto bajo un comando marcado mutante,
  // mientras que lo contrario (marcarlo `false` y luego insertar) sí sería una
  // mentira que la sonda de integridad pillaría.
  mutates: true,
  cursor: "crosshair",
  begin: () => ask({ output: null }),
  step: (state, input, context: CadCommandContext) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);

    if (input.kind === "enter" && state.output === null) return ask({ output: "table" });

    if (input.kind === "keyword") {
      if (input.keyword === "CSV") {
        const view = context.document?.();
        if (!view) return cadCommandRefused({ output: "csv" }, NO_DOCUMENT_VIEW);
        const schedule = buildCadBimSchedule(view);
        const content = buildCadDataExtractionCsv(schedule);
        return {
          state: { output: "csv" },
          prompt: { message: "", options: [] },
          accepts: 0,
          result: {
            kind: "host",
            request: { kind: "data-extraction-csv", fileName: "cuadro-de-cantidades.csv", content },
            label: "DATAEXTRACTION",
          },
        };
      }
      if (input.keyword === "Tabla") return ask({ output: "table" });
      if (input.keyword === "Superficies") return ask({ output: "rooms" });
      if (input.keyword === "carPintería") return ask({ output: "openings" });
      return ask(state);
    }

    if (input.kind !== "point") return ask(state);
    const view = context.document?.();
    if (!view) return cadCommandRefused(state, NO_DOCUMENT_VIEW);
    const schedule = buildCadBimSchedule(view);
    if (state.output === "rooms") {
      if (schedule.rooms.length === 0)
        return cadCommandRefused(state, "Los muros no cierran ningún local: no hay cuadro de superficies que insertar. Rotule cada local con un TEXT dentro para que salga con su nombre.");
      const table = buildCadRoomScheduleTable(schedule, input.point, context.activeLayer, context.newEntityId);
      return cadCommandWrites(state, [{ type: "insert", entity: table }], "DATAEXTRACTION Superficies");
    }
    if (state.output === "openings") {
      if (schedule.openings.length === 0)
        return cadCommandRefused(state, "El dibujo no tiene puertas ni ventanas alojadas en muro: no hay cuadro de carpintería que insertar.");
      const table = buildCadOpeningScheduleTable(schedule, input.point, context.activeLayer, context.newEntityId);
      return cadCommandWrites(state, [{ type: "insert", entity: table }], "DATAEXTRACTION Carpintería");
    }
    if (schedule.walls.length === 0)
      return cadCommandRefused(state, "El dibujo no tiene ningún muro que contar: no hay tabla que insertar.");
    const table = buildCadDataExtractionTable(schedule, input.point, context.activeLayer, context.newEntityId);
    return cadCommandWrites(state, [{ type: "insert", entity: table }], "DATAEXTRACTION");
  },
};

export const CAD_DATA_EXTRACTION_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(dataExtractionCommand),
];
