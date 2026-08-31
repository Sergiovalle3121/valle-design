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
import { buildCadDataExtractionCsv, buildCadDataExtractionTable } from "../../data-extraction/data-extraction";
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

const OUTPUT_OPTIONS = [
  { keyword: "Tabla", shortcut: "T" },
  { keyword: "CSV", shortcut: "C" },
] as const;

interface DataExtractionState {
  output: "table" | "csv" | null;
}

function ask(state: DataExtractionState): CadCommandStep<DataExtractionState> {
  if (state.output === "table")
    return {
      state,
      prompt: { message: "Precise el punto de inserción de la tabla", options: [] },
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
      return ask(state);
    }

    if (input.kind !== "point") return ask(state);
    const view = context.document?.();
    if (!view) return cadCommandRefused(state, NO_DOCUMENT_VIEW);
    const schedule = buildCadBimSchedule(view);
    if (schedule.walls.length === 0)
      return cadCommandRefused(state, "El dibujo no tiene ningún muro que contar: no hay tabla que insertar.");
    const table = buildCadDataExtractionTable(schedule, input.point, context.activeLayer, context.newEntityId);
    return cadCommandWrites(state, [{ type: "insert", entity: table }], "DATAEXTRACTION");
  },
};

export const CAD_DATA_EXTRACTION_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(dataExtractionCommand),
];
