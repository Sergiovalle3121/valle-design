/**
 * TABLEEXPORT: una TABLE del dibujo a un `.csv` de verdad.
 *
 * `docs/execution/auditoria-fable/dimensiones/12-productividad.md` (§3.5) lo
 * cuenta entre lo que falta a 1/10 —«sin fórmulas, sin DATALINK, sin
 * TABLEEXPORT»— y apunta el camino: reutilizar la misma coma-y-comillas que ya
 * usa `data-extraction/data-extraction.ts` en vez de inventar una segunda
 * regla de escape para el mismo formato.
 *
 * ## Qué exporta
 *
 * El TEXTO de cada celda —el mismo que se ve en el plano—, así que una celda
 * con fórmula exporta su VALOR calculado, no `=SUMA(A1:A5)`. Es lo que hace
 * `TABLEEXPORT` en AutoCAD: el csv es un documento de lectura, no una hoja de
 * cálculo enlazada.
 *
 * ## Las celdas TAPADAS por una combinación no duplican texto
 *
 * Una celda cubierta por `rowSpan`/`columnSpan` de otra (ver
 * `dxf-schema4-table.ts:coveredCells`, la misma idea) exporta la celda VACÍA:
 * el csv conserva la rejilla completa —cada fila con el mismo número de
 * columnas— sin repetir el contenido de la celda que la fusión absorbió.
 */
import type { CadTableEntity } from "../cad-entities-v4";

/** Coma, comilla o salto de línea: exige comillas, con la comilla duplicada. */
function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Casillas tapadas por una fusión: no llevan texto propio en el csv. */
function coveredCells(table: CadTableEntity): Set<string> {
  const covered = new Set<string>();
  for (const cell of table.cells) {
    const rows = Math.max(1, Math.floor(cell.rowSpan ?? 1));
    const columns = Math.max(1, Math.floor(cell.columnSpan ?? 1));
    for (let row = cell.row; row < cell.row + rows; row += 1)
      for (let column = cell.column; column < cell.column + columns; column += 1)
        if (row !== cell.row || column !== cell.column) covered.add(`${row}:${column}`);
  }
  return covered;
}

/** `TABLE` → texto `.csv`, con `\r\n` como separador de línea (RFC 4180). */
export function cadTableToCsv(table: CadTableEntity): string {
  const byKey = new Map<string, string>();
  for (const cell of table.cells) byKey.set(`${cell.row}:${cell.column}`, cell.text);
  const covered = coveredCells(table);
  const lines: string[] = [];
  for (let row = 0; row < table.rows; row += 1) {
    const fields: string[] = [];
    for (let column = 0; column < table.columns; column += 1) {
      const key = `${row}:${column}`;
      fields.push(covered.has(key) ? "" : csvField(byKey.get(key) ?? ""));
    }
    lines.push(fields.join(","));
  }
  return lines.join("\r\n") + (lines.length > 0 ? "\r\n" : "");
}
