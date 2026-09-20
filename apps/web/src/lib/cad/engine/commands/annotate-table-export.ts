/**
 * TABLEEXPORT — una TABLE del dibujo, a un `.csv` de verdad.
 *
 * `docs/execution/auditoria-fable/dimensiones/12-productividad.md` (§3.5) lo
 * cuenta entre lo que falta a 1/10: «sin fórmulas, sin DATALINK, sin
 * TABLEEXPORT», y el propio texto apunta el camino, que es el que se sigue
 * aquí: reutilizar la petición `"download"` que ya sirven `EXPORT` (STEP/IGES,
 * `solids-interop.ts`) y `DXFOUT` en vez de inventar un canal nuevo para un
 * archivo más. El motor calcula el texto entero del csv —aritmética de
 * cadenas, como el resto de `dxf-export.ts`— y el anfitrión sólo entrega el
 * archivo.
 */
import type { CadTableEntity } from "../../cad-entities-v4";
import { cadTableToCsv } from "../../tables/table-csv";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import { cadCommandCancelled, cadCommandRefused } from "./annotate-support";

interface ExportState {
  entityId: string | null;
}

const VACIO: ExportState = { entityId: null };

function pedirTabla(): CadCommandStep<ExportState> {
  return {
    state: VACIO,
    prompt: { message: "Designe la tabla a exportar", options: [] },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
  };
}

function exportar(entityId: string, context: CadCommandContext): CadCommandStep<ExportState> {
  const entity = context.entity?.(entityId);
  if (!entity) return cadCommandRefused(VACIO, `No encuentro el objeto ${entityId} en este dibujo.`);
  if (entity.type !== "table")
    return cadCommandRefused(VACIO, `TABLEEXPORT exporta tablas; ${entity.type.toUpperCase()} no lo es.`);
  const table = entity as unknown as CadTableEntity;
  const content = cadTableToCsv(table);
  return {
    state: VACIO,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "host",
      request: { kind: "download", filename: "tabla.csv", mime: "text/csv", content },
      label: `TABLEEXPORT: tabla de ${table.rows}×${table.columns} a CSV`,
    },
  };
}

const tableExportCommand: CadCommandDescriptor<ExportState> = {
  name: "TABLEEXPORT",
  aliases: [],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: false,
  cursor: "pick",
  begin: (context) => {
    const [first] = context.selection;
    return first ? exportar(first, context) : pedirTabla();
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);
    if (input.kind === "entityPick") return exportar(input.entityId, context);
    if (input.kind === "selection") {
      const [first] = input.entityIds;
      return first ? exportar(first, context) : pedirTabla();
    }
    return pedirTabla();
  },
};

export const CAD_TABLE_EXPORT_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(tableExportCommand),
];
