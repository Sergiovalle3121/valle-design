/**
 * El cuadro de instalaciones como TABLE (Ola F, 2026-09-02): una fila por
 * servicio y tamaño con su longitud en metros, y una por símbolo con su
 * cantidad. Sale en la lámina por `paper-space-table.ts` como los demás.
 */
import type { CadPoint2 } from "../cad-document";
import type { CadNativeEntity } from "../entity-runtime";
import { cadMillimetresPerUnit } from "../engine/commands/architecture-support";
import type { CadMepSchedule } from "../mep-schedule";
import { scheduleTable } from "./data-extraction";

type CadTableEntity = Extract<CadNativeEntity, { type: "table" }>;

export const MEP_HEADERS = ["Servicio", "Capa", "Tipo", "Diám. / ancho (mm)", "Tramos", "Longitud (m)", "Cantidad"] as const;

const KIND_LABEL = { pipe: "Tubería", duct: "Ducto", tray: "Charola" } as const;

export function buildCadMepScheduleTable(
  schedule: CadMepSchedule,
  insertion: CadPoint2,
  layer: string,
  newEntityId: () => string,
  unit: string | undefined,
): CadTableEntity {
  const mm = cadMillimetresPerUnit(unit);
  const metres = (length: number) => ((length * mm) / 1000).toFixed(2);
  const size = (row: CadMepSchedule["runs"][number]) =>
    row.size === null ? "-" : row.kind === "pipe" ? String(Math.round(row.size)) : String(Math.round(row.size * mm));
  const rows: string[][] = [
    ...schedule.runs.map((row) => [row.service.label, row.service.layer, KIND_LABEL[row.kind], size(row), String(row.segments), metres(row.length), "-"]),
    ...schedule.devices.map((row) => [row.name, row.layer, "Equipo", "-", "-", "-", String(row.count)]),
  ];
  return scheduleTable(
    "Cuadro de instalaciones: longitudes por el eje de cada tramo; equipos por símbolo insertado",
    MEP_HEADERS,
    rows,
    insertion,
    layer,
    newEntityId,
    1_500,
  );
}
