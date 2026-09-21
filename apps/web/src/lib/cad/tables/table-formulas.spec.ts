/**
 * El analizador y el recálculo de fórmulas de TABLE, contra valores reales.
 *
 * Cada comprobación construye una tabla (o un contexto de evaluación mínimo),
 * ejecuta la fórmula de verdad y MIDE el número que sale — nunca «no lanzó» o
 * «devolvió algo».
 */
import { strict as assert } from "node:assert";
import type { CadTableCell, CadTableEntity } from "../cad-entities-v4";
import {
  cadEvaluateTableFormula,
  cadFormatTableFormulaValue,
  cadRecalcTableFormulas,
  cadTableColumnFromLetters,
  cadTableLettersFromColumn,
} from "./table-formulas";

let checks = 0;
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

function cell(row: number, column: number, text: string, formula?: string): CadTableCell {
  return formula ? { row, column, text, formula } : { row, column, text };
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

// --- letras de columna, ida y vuelta -------------------------------------------------
{
  eq(cadTableColumnFromLetters("A"), 0, "A es la columna 0");
  eq(cadTableColumnFromLetters("Z"), 25, "Z es la columna 25");
  eq(cadTableColumnFromLetters("AA"), 26, "AA es la columna 26");
  eq(cadTableLettersFromColumn(0), "A", "0 vuelve a A");
  eq(cadTableLettersFromColumn(26), "AA", "26 vuelve a AA");
  eq(cadTableColumnFromLetters("3"), -1, "un dígito no es una columna");
}

// --- SUMA de un rango, sobre celdas de verdad ------------------------------------------
{
  const doc = table(4, 1, [
    cell(0, 0, "10"),
    cell(1, 0, "20"),
    cell(2, 0, "30"),
    cell(3, 0, "", "=SUMA(A1:A3)"),
  ]);
  const recalculated = cadRecalcTableFormulas(doc);
  eq(recalculated.find((c) => c.row === 3)?.text, "60", "SUMA de tres celdas");
}

// --- PROMEDIO ignora blancos y texto, CONTAR sólo cuenta lo numérico -------------------
{
  const doc = table(6, 1, [
    cell(0, 0, "10"),
    cell(1, 0, ""),
    cell(2, 0, "Pendiente"),
    cell(3, 0, "30"),
    cell(4, 0, "", "=PROMEDIO(A1:A4)"),
    cell(5, 0, "", "=CONTAR(A1:A4)"),
  ]);
  const recalculated = cadRecalcTableFormulas(doc);
  eq(recalculated.find((c) => c.row === 4)?.text, "20", "promedio de 10 y 30, blanco y texto fuera");
  eq(recalculated.find((c) => c.row === 5)?.text, "2", "sólo dos celdas numéricas");
}

// --- referencia directa y aritmética entre celdas --------------------------------------
{
  const doc = table(3, 2, [
    cell(0, 0, "4"),
    cell(0, 1, "5"),
    cell(1, 0, "", "=A1+B1"),
    cell(2, 0, "", "=(A1+B1)*2"),
  ]);
  const recalculated = cadRecalcTableFormulas(doc);
  eq(recalculated.find((c) => c.row === 1 && c.column === 0)?.text, "9", "A1+B1");
  eq(recalculated.find((c) => c.row === 2 && c.column === 0)?.text, "18", "(A1+B1)*2");
}

// --- recalcula al cambiar una celda de origen, no sólo al crear la fórmula -------------
{
  const original = table(2, 1, [cell(0, 0, "10"), cell(1, 0, "", "=SUMA(A1:A1)")]);
  const before = cadRecalcTableFormulas(original);
  eq(before.find((c) => c.row === 1)?.text, "10", "valor inicial");
  const edited = table(2, 1, before.map((c) => (c.row === 0 ? { ...c, text: "99" } : c)));
  const after = cadRecalcTableFormulas(edited);
  eq(after.find((c) => c.row === 1)?.text, "99", "el total sigue a la celda de origen");
}

// --- una fórmula que depende de otra fórmula encadena bien -----------------------------
{
  const doc = table(3, 1, [
    cell(0, 0, "7"),
    cell(1, 0, "", "=A1*2"),
    cell(2, 0, "", "=SUMA(A1:A2)"),
  ]);
  const recalculated = cadRecalcTableFormulas(doc);
  eq(recalculated.find((c) => c.row === 1)?.text, "14", "A1*2");
  eq(recalculated.find((c) => c.row === 2)?.text, "21", "7 + 14, encadenado");
}

// --- ciclo: se corta y lo dice, no arrastra el error a quien la use --------------------
{
  const doc = table(3, 1, [
    cell(0, 0, "", "=A2"),
    cell(1, 0, "", "=A1"),
    cell(2, 0, "", "=A1+1"),
  ]);
  const recalculated = cadRecalcTableFormulas(doc);
  eq(recalculated.find((c) => c.row === 0)?.text, "#CICLO!", "A1 participa del ciclo");
  eq(recalculated.find((c) => c.row === 1)?.text, "#CICLO!", "y B1 también, aunque no cierre ella el bucle");
  eq(recalculated.find((c) => c.row === 2)?.text, "1", "quien usa la cíclica la ve ausente (0), no arrastra el error");
}

// --- fórmula rota, con nombre ------------------------------------------------------------
{
  eq(
    cadEvaluateTableFormula("=DESCONOCIDA(A1)", { refValue: () => 1, rangeValues: () => [1] }),
    { ok: false, error: "#FÓRMULA!" },
    "una función que no existe no inventa un valor",
  );
  eq(
    cadEvaluateTableFormula("=A1/0", { refValue: () => 5, rangeValues: () => [] }),
    { ok: false, error: "#FÓRMULA!" },
    "dividir por cero se rechaza",
  );
  eq(
    cadEvaluateTableFormula("=(A1+", { refValue: () => 1, rangeValues: () => [] }),
    { ok: false, error: "#FÓRMULA!" },
    "paréntesis sin cerrar",
  );
}

// --- formato del valor: sin ceros de cola, sin `-0` --------------------------------------
{
  eq(cadFormatTableFormulaValue(3), "3", "entero, sin `.0`");
  eq(cadFormatTableFormulaValue(2.5), "2.5", "decimal simple");
  eq(cadFormatTableFormulaValue(-0), "0", "menos cero se escribe 0");
  eq(cadFormatTableFormulaValue(1 / 3), "0.333333", "redondeo a 6 decimales");
}

// --- una celda vacía cuenta como 0 en aritmética directa, y no como texto en rango -----
{
  ok(
    cadEvaluateTableFormula("=A1+5", { refValue: () => null, rangeValues: () => [] }).ok === true &&
      (cadEvaluateTableFormula("=A1+5", { refValue: () => null, rangeValues: () => [] }) as { value: number })
        .value === 5,
    "una referencia ausente vale 0 en una suma directa",
  );
}

console.log(
  `table-formulas: ${checks} comprobaciones · SUMA/PROMEDIO/CONTAR, referencias, ciclo, y formato`,
);
