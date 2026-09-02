/**
 * DATAEXTRACTION: el cuadro de cantidades, a tabla del dibujo y a CSV.
 *
 * `bim-schedule.ts` ya calcula las cantidades de muro, la carpintería y el
 * cuadro de áreas DEL MODELO — no hay nada que volver a medir aquí. Lo que
 * faltaba era la salida que un despacho de verdad entrega con el juego de
 * planos: una tabla dentro del dibujo (con su propio tipo nativo, `table`,
 * enchufado desde la ola del esquema 4 y sin comando que lo llenara con datos
 * reales) y un CSV para pegar en la memoria de cálculo.
 *
 * ## Por qué NO se corrige aquí el sesgo de esquina
 *
 * `buildCadBimSchedule` sub-factura el volumen de fábrica en cada esquina en
 * L/T/X (~1,45% medido, BACKLOG P1-6): el inglete real EXTIENDE la cara
 * exterior del muro y esta tabla sólo resta la interior. Corregir la fórmula
 * es una decisión del titular de `bim-schedule.ts`, no de quien extrae — así
 * que este módulo hereda el número tal cual y lo DECLARA en vez de callarlo:
 * `CAD_DATA_EXTRACTION_VOLUME_CAVEAT` viaja en la tabla y en el CSV.
 */
import type { CadPoint2 } from "../cad-document";
import type { CadTableCell } from "../cad-entities-v4";
import type { CadNativeEntity } from "../entity-runtime";
import type { CadBimSchedule, CadWallQuantityRow, CadOpeningQuantityRow, CadRoomAreaRow } from "../bim-schedule";

type CadTableEntity = Extract<CadNativeEntity, { type: "table" }>;

export const CAD_DATA_EXTRACTION_VOLUME_CAVEAT =
  "El volumen de muro sub-factura fábrica real en cada esquina en L/T/X (~1,45%, BACKLOG P1-6): resta el solape de unión sin sumar de vuelta la extensión de la cara exterior que produce el mismo inglete.";

function fmt(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

const WALL_HEADERS = ["Capa", "Espesor (mm)", "Cant.", "Longitud (m)", "Área paramento (m²)", "Volumen (m³)"];
const OPENING_HEADERS = ["Marca", "Tipo", "Ancho (mm)", "Alto (mm)", "Antepecho (mm)", "Cant."];
const ROOM_HEADERS = ["Local", "Uso", "Área a ejes (m²)", "Área útil (m²)", "Perímetro (m)"];

function wallRowValues(row: CadWallQuantityRow): string[] {
  return [
    row.layer,
    fmt(row.thickness, 0),
    String(row.count),
    fmt(row.length / 1000, 3),
    fmt(row.faceArea / 1_000_000, 3),
    fmt(row.volume / 1_000_000_000, 4),
  ];
}

function openingRowValues(row: CadOpeningQuantityRow): string[] {
  return [row.mark, row.kind === "door" ? "Puerta" : "Ventana", fmt(row.width, 0), fmt(row.height, 0), fmt(row.sill, 0), String(row.count)];
}

function roomRowValues(row: CadRoomAreaRow): string[] {
  return [
    // El nombre que el dibujante escribió dentro del local; sin rótulo, la
    // clave geométrica (L-01…), que es la verdad y no un invento.
    row.name ?? row.id,
    row.use ?? "—",
    fmt(row.axisArea / 1_000_000, 2),
    row.clearArea === undefined ? "—" : fmt(row.clearArea / 1_000_000, 2),
    fmt(row.perimeter / 1000, 2),
  ];
}

/**
 * CSV de las tres tablas, en secciones.
 *
 * Un solo archivo y no tres: es lo que un despacho adjunta a una memoria de
 * cálculo, y tres descargas por cada DATAEXTRACTION es la clase de fricción
 * que hace que la gente vuelva a escribirlo a mano.
 */
export function buildCadDataExtractionCsv(schedule: CadBimSchedule): string {
  const csvValue = (value: string): string =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const line = (values: readonly string[]): string => values.map(csvValue).join(",");
  const lines: string[] = [];

  lines.push("MUROS");
  lines.push(`# ${CAD_DATA_EXTRACTION_VOLUME_CAVEAT}`);
  lines.push(line(WALL_HEADERS));
  for (const row of schedule.walls) lines.push(line(wallRowValues(row)));
  lines.push("");

  lines.push("CARPINTERÍA");
  lines.push(line(OPENING_HEADERS));
  for (const row of schedule.openings) lines.push(line(openingRowValues(row)));
  lines.push("");

  lines.push("LOCALES");
  lines.push(line(ROOM_HEADERS));
  for (const row of schedule.rooms) lines.push(line(roomRowValues(row)));

  if (schedule.problems.length > 0) {
    lines.push("");
    lines.push("PROBLEMAS (no contados)");
    for (const problem of schedule.problems) lines.push(line([problem]));
  }

  return lines.join("\r\n");
}

/**
 * La misma tabla de muros, como entidad `table` nativa insertada en el punto
 * indicado. Sólo la de muros: es la que un presupuesto pide primero, y las
 * tres a la vez no caben legibles en una sola tabla sin un diseño de columnas
 * que esta orden todavía no tiene — el CSV lleva las tres completas.
 */
/**
 * Una tabla nativa a partir de una cabecera y sus filas: el título en una
 * celda fusionada, la cabecera y una fila por registro. Es lo que comparten
 * el cuadro de muros, el de superficies y el de carpintería; tenerlo tres
 * veces habría dejado tres anchos de columna distintos para el mismo texto.
 */
function scheduleTable(
  title: string,
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  insertion: CadPoint2,
  layer: string,
  newEntityId: () => string,
  columnWidth = 1_400,
): CadTableEntity {
  const cells: CadTableCell[] = [];
  cells.push({ row: 0, column: 0, text: title, columnSpan: headers.length, textHeight: 90 });
  headers.forEach((header, column) => cells.push({ row: 1, column, text: header, textHeight: 100 }));
  rows.forEach((values, index) => {
    values.forEach((value, column) => cells.push({ row: index + 2, column, text: value, textHeight: 90 }));
  });
  return {
    id: newEntityId(),
    type: "table",
    insertion: { x: insertion.x, y: insertion.y, z: 0 },
    rows: rows.length + 2,
    columns: headers.length,
    rowHeights: Array.from({ length: rows.length + 2 }, () => 220),
    columnWidths: Array.from({ length: headers.length }, () => columnWidth),
    cells,
    layer,
  };
}

/**
 * El CUADRO DE SUPERFICIES (Ola E, 2026-09-02): un local por fila, con el
 * nombre que el dibujante escribió dentro de él. Es la tabla que se entrega
 * con cada juego de planos y que antes decía «L-03» en vez de «Recámara».
 */
export function buildCadRoomScheduleTable(
  schedule: CadBimSchedule,
  insertion: CadPoint2,
  layer: string,
  newEntityId: () => string,
): CadTableEntity {
  return scheduleTable(
    "Cuadro de superficies — áreas a ejes de muro; área útil con los lados metidos medio grosor",
    ROOM_HEADERS,
    schedule.rooms.map(roomRowValues),
    insertion,
    layer,
    newEntityId,
    1_600,
  );
}

/** El CUADRO DE CARPINTERÍA: puertas y ventanas por marca y antepecho, con su cantidad. */
export function buildCadOpeningScheduleTable(
  schedule: CadBimSchedule,
  insertion: CadPoint2,
  layer: string,
  newEntityId: () => string,
): CadTableEntity {
  return scheduleTable(
    "Cuadro de carpintería — huecos de obra alojados en muro",
    OPENING_HEADERS,
    schedule.openings.map(openingRowValues),
    insertion,
    layer,
    newEntityId,
    1_200,
  );
}

export function buildCadDataExtractionTable(
  schedule: CadBimSchedule,
  insertion: CadPoint2,
  layer: string,
  newEntityId: () => string,
): CadTableEntity {
  const rows = schedule.walls.length + 2; // cabecera + aviso + una por muro
  const columns = WALL_HEADERS.length;
  const cells: CadTableCell[] = [];

  cells.push({
    row: 0,
    column: 0,
    text: `Cuadro de cantidades de muro — ${CAD_DATA_EXTRACTION_VOLUME_CAVEAT}`,
    columnSpan: columns,
    textHeight: 90,
  });
  WALL_HEADERS.forEach((header, column) => {
    cells.push({ row: 1, column, text: header, textHeight: 100 });
  });
  schedule.walls.forEach((row, index) => {
    wallRowValues(row).forEach((value, column) => {
      cells.push({ row: index + 2, column, text: value, textHeight: 90 });
    });
  });

  return {
    id: newEntityId(),
    type: "table",
    insertion: { x: insertion.x, y: insertion.y, z: 0 },
    rows,
    columns,
    rowHeights: Array.from({ length: rows }, () => 220),
    columnWidths: Array.from({ length: columns }, () => 1_400),
    cells,
    layer,
  };
}
