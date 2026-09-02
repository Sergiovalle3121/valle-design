/**
 * EL TEXTO DE LAS CELDAS DE UNA TABLE EN LA LÁMINA (Ola E, 2026-09-02).
 *
 * Medido antes con `buildCadPublishPlan` sobre un cuadro de 2 × 2 con las
 * cuatro celdas llenas: el cuadro llegaba a la lámina como TRES caminos —el
 * marco y la rejilla, que aporta el respaldo del registro— y CERO textos, con
 * `warnings: []`. El cuadro de superficies salía impreso como una rejilla
 * vacía y nadie lo decía. (El informe de distancia del 2026-09-01 lo había
 * medido igual: «NI UNA de las 4 celdas llenas de la tabla».)
 *
 * Aquí se emite un comando de texto por celda con la MISMA ancla que usa el
 * visor (`render/text-requests.ts`): `middle-left` por defecto, relleno de
 * 0,15 × alto de fila en los bordes, altura de texto de la celda o la mitad
 * de la fila, giro de la tabla. Es la misma tabla de anclas que el escritor
 * DXF (`dxf-schema4-table.ts`); si viviera dos veces, un cuadro se leería en
 * un sitio distinto según quién lo mirase.
 *
 * Vive en su propio módulo porque `paper-space.ts` tiene presupuesto propio en
 * `scripts/cad/monolith-budget.json` y sólo puede encoger. No importa nada de
 * `paper-space.ts`: devuelve la forma estructural del comando de texto, que es
 * la que aquel módulo ya consume.
 */
import type { CadPoint2 } from "./cad-document";
import type { CadNativeEntity } from "./entity-runtime";
import { cadTableFrame } from "./annotation-v4-adapters";

type CadTableEntity = Extract<CadNativeEntity, { type: "table" }>;

/** El mismo relleno que el visor y el DXF: 0,15 × alto de fila. */
const CELL_PADDING = 0.15;
/**
 * El punto de un comando de texto de la lámina es su LÍNEA BASE (así lo
 * consume `plot-job.ts` al convertirlo en rótulo). Para que el texto quede
 * centrado en la fila, la línea base baja del centro algo más de un tercio de
 * la altura del texto: la altura de las minúsculas sobre la base.
 */
const BASELINE_FROM_MIDDLE = 0.35;

export interface CadTableCellTextCommand {
  kind: "text";
  entityId: string;
  viewportId: string;
  point: CadPoint2;
  text: string;
  size: number;
  rotation: number;
  color: string;
  align: "left" | "center" | "right";
}

export interface CadTableTextTarget {
  viewportId: string;
  /** Modelo → papel, la misma matriz con la que se trazó la rejilla. */
  toPaper: (point: CadPoint2) => CadPoint2;
  /** Factor lineal de esa matriz: mm de papel por unidad de dibujo. */
  scale: number;
  color: string;
}

/** Los textos de las celdas, uno por celda con contenido dentro de la tabla. */
export function cadTableCellTextCommands(
  entity: CadTableEntity,
  target: CadTableTextTarget,
): CadTableCellTextCommand[] {
  const frame = cadTableFrame(entity);
  const rotation = entity.rotation ?? 0;
  const columnX = entity.columnWidths.map((_, index) =>
    entity.columnWidths.slice(0, index).reduce((total, value) => total + value, 0),
  );
  const rowY = entity.rowHeights.map((_, index) =>
    entity.rowHeights.slice(0, index).reduce((total, value) => total + value, 0),
  );
  const commands: CadTableCellTextCommand[] = [];
  for (const cell of entity.cells) {
    if (cell.text.trim() === "" || cell.row >= entity.rows || cell.column >= entity.columns) continue;
    const width = entity.columnWidths[cell.column] ?? 0;
    const height = entity.rowHeights[cell.row] ?? 0;
    const padding = height * CELL_PADDING;
    const alignment = cell.alignment ?? "middle-left";
    const textHeight = cell.textHeight ?? height * 0.5;
    const localX = alignment.endsWith("right") ? width - padding : alignment.endsWith("center") ? width / 2 : padding;
    const middle = alignment.startsWith("top")
      ? padding + textHeight / 2
      : alignment.startsWith("bottom")
        ? height - padding - textHeight / 2
        : height / 2;
    const anchor = frame.toWorld((columnX[cell.column] ?? 0) + localX, (rowY[cell.row] ?? 0) + middle + textHeight * BASELINE_FROM_MIDDLE);
    commands.push({
      kind: "text",
      entityId: entity.id,
      viewportId: target.viewportId,
      point: target.toPaper(anchor),
      text: cell.text,
      // La misma horquilla que un MTEXT en la lámina: ni ilegible ni un titular.
      size: Math.max(1.5, Math.min(12, textHeight * target.scale)),
      rotation,
      color: target.color,
      align: alignment.endsWith("right") ? "right" : alignment.endsWith("center") ? "center" : "left",
    });
  }
  return commands;
}
