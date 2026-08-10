/**
 * TABLE → geometría DXF, y por qué no se escribe una ACAD_TABLE.
 *
 * Una ACAD_TABLE fiel no es una entidad: es una entidad MÁS un TABLESTYLE en la
 * sección de objetos, MÁS un bloque anónimo con el contenido, MÁS el formato
 * por celda (tipos 171/172/173, alineación, altura, estilo y color por celda).
 * Sin el TABLESTYLE al que apunta su grupo 342, AutoCAD rechaza la entidad y la
 * mayoría de los visores no dibujan absolutamente nada.
 *
 * Elegir entre "una tabla editable que quizá no se vea" y "una tabla que se ve
 * en todas partes pero deja de ser una tabla" no es una decisión que pueda
 * tomarse en silencio. Se toma la segunda —el cliente que recibe el DXF ve el
 * cuadro— y se DECLARA en el manifiesto de pérdidas: al reimportar volverán
 * líneas y textos, no una tabla. Un fichero que enseña el cuadro y un aviso que
 * dice exactamente qué se degradó valen más que una entidad muda.
 *
 * La geometría respeta medidas de fila y columna, combinaciones de celdas
 * (`rowSpan`/`columnSpan`), alineación y rotación.
 */
import type { CadDxfPoint, CadDxfPrimitive } from "./dxf-import";
import type { CadDxfSchema4TableCell, CadDxfSchema4TablePayload } from "./dxf-schema4";

/** Margen del texto dentro de su celda, en fracción de la altura de fila. */
const CELL_PADDING = 0.15;

interface CellRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function prefixSums(values: number[], count: number, fallback: number): number[] {
  const sums = [0];
  for (let index = 0; index < count; index += 1)
    sums.push(sums[index] + (values[index] ?? fallback));
  return sums;
}

/** Celdas TAPADAS por la combinación de otra: no se dibujan ni se separan. */
function coveredCells(payload: CadDxfSchema4TablePayload): Set<string> {
  const covered = new Set<string>();
  for (const cell of payload.cells) {
    const rows = Math.max(1, Math.floor(cell.rowSpan ?? 1));
    const columns = Math.max(1, Math.floor(cell.columnSpan ?? 1));
    for (let row = cell.row; row < cell.row + rows; row += 1)
      for (let column = cell.column; column < cell.column + columns; column += 1)
        if (row !== cell.row || column !== cell.column)
          covered.add(`${row}:${column}`);
  }
  return covered;
}

/**
 * Rejilla y textos de la tabla como primitivas ordinarias.
 *
 * El origen es la esquina SUPERIOR izquierda y las filas crecen hacia abajo,
 * como en AutoCAD: una tabla insertada en (0, 1000) con filas de 200 ocupa de
 * y=1000 a y=600, no al revés.
 */
export function tableToDxfPrimitives(
  layer: string,
  insertion: CadDxfPoint,
  payload: CadDxfSchema4TablePayload,
): CadDxfPrimitive[] {
  const rows = Math.max(0, Math.floor(payload.rows));
  const columns = Math.max(0, Math.floor(payload.columns));
  if (!rows || !columns) return [];
  const rowOffsets = prefixSums(payload.rowHeights, rows, 200);
  const columnOffsets = prefixSums(payload.columnWidths, columns, 500);
  const radians = ((payload.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  // La rotación es alrededor del punto de inserción, igual que la de un INSERT.
  const place = (dx: number, dy: number): CadDxfPoint => ({
    x: insertion.x + dx * cos - dy * sin,
    y: insertion.y + dx * sin + dy * cos,
  });

  const byPosition = new Map<string, CadDxfSchema4TableCell>();
  for (const cell of payload.cells) byPosition.set(`${cell.row}:${cell.column}`, cell);
  const covered = coveredCells(payload);
  const primitives: CadDxfPrimitive[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (covered.has(`${row}:${column}`)) continue;
      const cell = byPosition.get(`${row}:${column}`);
      const rowSpan = Math.min(rows - row, Math.max(1, Math.floor(cell?.rowSpan ?? 1)));
      const columnSpan = Math.min(
        columns - column,
        Math.max(1, Math.floor(cell?.columnSpan ?? 1)),
      );
      const rect: CellRect = {
        x: columnOffsets[column],
        y: -rowOffsets[row],
        width: columnOffsets[column + columnSpan] - columnOffsets[column],
        height: rowOffsets[row + rowSpan] - rowOffsets[row],
      };
      primitives.push({
        kind: "polyline",
        layer,
        closed: true,
        points: [
          place(rect.x, rect.y),
          place(rect.x + rect.width, rect.y),
          place(rect.x + rect.width, rect.y - rect.height),
          place(rect.x, rect.y - rect.height),
        ],
      });
      const text = (cell?.text ?? "").trim();
      if (!text) continue;
      const height = cell?.textHeight ?? Math.max(1e-9, rect.height * 0.5);
      const padding = rect.height * CELL_PADDING;
      const anchor = cell?.alignment ?? "middle-left";
      const dx = anchor.endsWith("-right")
        ? rect.x + rect.width - padding
        : anchor.endsWith("-center")
          ? rect.x + rect.width / 2
          : rect.x + padding;
      const dy = anchor.startsWith("top-")
        ? rect.y - padding - height
        : anchor.startsWith("bottom-")
          ? rect.y - rect.height + padding
          : rect.y - rect.height / 2 - height / 2;
      primitives.push({
        kind: "text",
        layer,
        points: [place(dx, dy)],
        text,
        textHeight: height,
      });
    }
  }
  return primitives;
}
