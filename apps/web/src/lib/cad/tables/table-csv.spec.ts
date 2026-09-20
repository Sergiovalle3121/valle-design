/**
 * `cadTableToCsv` contra un csv real, comparado carácter a carácter.
 */
import { strict as assert } from "node:assert";
import type { CadTableCell, CadTableEntity } from "../cad-entities-v4";
import { cadTableToCsv } from "./table-csv";

let checks = 0;
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

function cell(row: number, column: number, text: string, span?: { rowSpan?: number; columnSpan?: number }): CadTableCell {
  return { row, column, text, ...span };
}

function table(rows: number, columns: number, cells: CadTableCell[]): CadTableEntity {
  return {
    id: "t1",
    type: "table",
    insertion: { x: 0, y: 0, z: 0 },
    rows,
    columns,
    rowHeights: Array.from({ length: rows }, () => 200),
    columnWidths: Array.from({ length: columns }, () => 1_000),
    cells,
    layer: "0",
  };
}

// --- rejilla sencilla, con celdas vacías --------------------------------------------
{
  const doc = table(2, 2, [cell(0, 0, "Partida"), cell(0, 1, "Coste"), cell(1, 0, "Zapatas")]);
  eq(cadTableToCsv(doc), "Partida,Coste\r\nZapatas,\r\n", "dos filas, comas para lo vacío, CRLF");
}

// --- comas, comillas y saltos de línea llevan comillas y se duplican ------------------
{
  const doc = table(1, 3, [
    cell(0, 0, "1,20 m"),
    cell(0, 1, 'Ancho "libre"'),
    cell(0, 2, "línea uno\nlínea dos"),
  ]);
  eq(
    cadTableToCsv(doc),
    '"1,20 m","Ancho ""libre""","línea uno\nlínea dos"\r\n',
    "escape RFC 4180 exacto",
  );
}

// --- una celda fusionada no repite su texto en la que tapó ----------------------------
{
  const doc = table(2, 2, [cell(0, 0, "Título", { columnSpan: 2 }), cell(1, 0, "A"), cell(1, 1, "B")]);
  eq(cadTableToCsv(doc), "Título,\r\nA,B\r\n", "la celda tapada por columnSpan exporta vacía");
}

// --- tabla sin filas: cadena vacía, no un CRLF suelto ---------------------------------
{
  const doc = table(0, 0, []);
  eq(cadTableToCsv(doc), "", "cero filas, cero salida");
}

console.log(`table-csv: ${checks} comprobaciones · escape RFC 4180 y fusión sin duplicar texto`);
