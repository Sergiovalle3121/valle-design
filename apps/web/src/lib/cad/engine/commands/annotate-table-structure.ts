/**
 * TINSERT — insertar y borrar filas o columnas de una TABLE, y fusionar celdas.
 *
 * ## Por qué es una orden aparte de TABLEDIT
 *
 * `annotate-table-edit.ts` lo dice desde su propio encabezado: `TABLEDIT`
 * cambia el texto de UNA celda de una rejilla ya fijada. Insertar una fila
 * cambia la REJILLA entera —cuántas filas tiene la tabla, qué fila es cuál—, y
 * mezclar las dos cosas en una sola máquina de estados habría hecho que
 * "Indique la fila" significara dos preguntas distintas según por dónde se
 * hubiera entrado. `docs/execution/auditoria-fable/dimensiones/12-productividad.md`
 * (§3.5) mide el hueco: «Sin fórmulas, sin DATALINK, sin TABLEEXPORT» y, en el
 * propio código, «hoy TABLEDIT sólo cambia el texto de una celda de una
 * rejilla fijada al crear la tabla».
 *
 * ## Qué NO ajusta, y por qué se dice
 *
 * - **Las fórmulas no cambian de referencia.** Insertar una fila ANTES de la 3
 *   no convierte `=SUMA(A1:A5)` en `=SUMA(A1:A6)`. Ajustar referencias exige un
 *   analizador de fórmulas que reescriba, no sólo que calcule
 *   (`tables/table-formulas.ts` sólo hace lo segundo), y prometerlo sin
 *   hacerlo sería el mismo «éxito falso» que el resto del motor evita. Las
 *   fórmulas SÍ se recalculan con la rejilla nueva —lo que cambia es qué celda
 *   ocupa cada fila, no el texto de la fórmula—, así que una `=SUMA(A1:A3)`
 *   sigue sumando esas tres celdas físicas aunque ahora se llamen distinto.
 * - **Una fusión que insertar atraviesa no se ensancha sola.** Insertar una
 *   fila dentro del rango de una celda ya fusionada dista su `rowSpan` en vez
 *   de crecerlo; se declara aquí para que quien lo golpee sepa que es un
 *   límite conocido y no un error nuevo.
 *
 * ## Fusionar conserva sólo el contenido de la celda superior izquierda
 *
 * Es lo que hace `MERGE CELLS` de AutoCAD por defecto: las demás celdas del
 * rectángulo desaparecen con su texto. Promediar o concatenar el contenido de
 * varias celdas sería inventar una regla que AutoCAD no tiene.
 */
import type { CadTableCell, CadTableEntity } from "../../cad-entities-v4";
import type { CadNativeEntity } from "../../entity-runtime";
import { cadRecalcTableFormulas } from "../../tables/table-formulas";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_SELECTION,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import { cadCommandCancelled, cadCommandRefused, cadCommandWrites } from "./annotate-support";

type StructureAction =
  | "row-above"
  | "row-below"
  | "row-delete"
  | "column-left"
  | "column-right"
  | "column-delete"
  | "merge";

type StructurePending = "action" | "index" | "merge-row1" | "merge-col1" | "merge-row2" | "merge-col2";

interface StructureState {
  entityId: string | null;
  rows: number;
  columns: number;
  action: StructureAction | null;
  pending: StructurePending;
  mergeRow1: number | null;
  mergeColumn1: number | null;
  mergeRow2: number | null;
}

const VACIO: StructureState = {
  entityId: null,
  rows: 0,
  columns: 0,
  action: null,
  pending: "action",
  mergeRow1: null,
  mergeColumn1: null,
  mergeRow2: null,
};

const ROW_ABOVE = { keyword: "FilaArriba", shortcut: "FA" } as const;
const ROW_BELOW = { keyword: "FilaAbajo", shortcut: "FB" } as const;
const ROW_DELETE = { keyword: "BorrarFila", shortcut: "BF" } as const;
const COLUMN_LEFT = { keyword: "ColumnaIzquierda", shortcut: "CI" } as const;
const COLUMN_RIGHT = { keyword: "ColumnaDerecha", shortcut: "CD" } as const;
const COLUMN_DELETE = { keyword: "BorrarColumna", shortcut: "BC" } as const;
const MERGE = { keyword: "Fusionar", shortcut: "FU" } as const;

const ACTION_OPTIONS = [ROW_ABOVE, ROW_BELOW, ROW_DELETE, COLUMN_LEFT, COLUMN_RIGHT, COLUMN_DELETE, MERGE];

const ACTION_BY_KEYWORD: Readonly<Record<string, StructureAction>> = {
  [ROW_ABOVE.keyword]: "row-above",
  [ROW_BELOW.keyword]: "row-below",
  [ROW_DELETE.keyword]: "row-delete",
  [COLUMN_LEFT.keyword]: "column-left",
  [COLUMN_RIGHT.keyword]: "column-right",
  [COLUMN_DELETE.keyword]: "column-delete",
  [MERGE.keyword]: "merge",
};

const isRowAction = (action: StructureAction): boolean => action.startsWith("row");

function paso(state: StructureState): CadCommandStep<StructureState> {
  if (!state.entityId)
    return {
      state,
      prompt: { message: "Designe la tabla", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  if (!state.action)
    return {
      state,
      prompt: {
        message: "Elija la operación",
        options: ACTION_OPTIONS,
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  if (state.action === "merge") {
    const prompts: Record<Exclude<StructurePending, "action" | "index">, string> = {
      "merge-row1": `Primera celda: indique la fila (1 a ${state.rows})`,
      "merge-col1": `Primera celda: indique la columna (1 a ${state.columns})`,
      "merge-row2": `Celda opuesta: indique la fila (1 a ${state.rows})`,
      "merge-col2": `Celda opuesta: indique la columna (1 a ${state.columns})`,
    };
    const key = state.pending as Exclude<StructurePending, "action" | "index">;
    return {
      state,
      prompt: { message: prompts[key] ?? prompts["merge-row1"], options: [], defaultValue: "1" },
      accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
    };
  }
  const max = isRowAction(state.action) ? state.rows : state.columns;
  return {
    state,
    prompt: {
      message: `Indique la ${isRowAction(state.action) ? "fila" : "columna"} (1 a ${max})`,
      options: [],
      defaultValue: "1",
    },
    accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
  };
}

function designar(entityId: string, context: CadCommandContext): CadCommandStep<StructureState> {
  const entity = context.entity?.(entityId);
  if (!entity) return cadCommandRefused(VACIO, `No encuentro el objeto ${entityId} en este dibujo.`);
  if (entity.type !== "table")
    return cadCommandRefused(VACIO, `TINSERT trabaja sobre tablas; ${entity.type.toUpperCase()} no lo es.`);
  const table = entity as unknown as CadTableEntity;
  return paso({ ...VACIO, entityId, rows: table.rows, columns: table.columns });
}

/** Índice 1-based tecleado, ya validado contra el tope. */
function indice(raw: number, tope: number): number | null {
  const entero = Math.floor(raw);
  return Number.isFinite(entero) && entero >= 1 && entero <= tope ? entero - 1 : null;
}

// ---------------------------------------------------------------------------
// Reescritura de la rejilla
// ---------------------------------------------------------------------------

function insertRowAt(table: CadTableEntity, insertIndex: number, heightSource: number): CadTableEntity {
  const height = table.rowHeights[heightSource] ?? table.rowHeights[table.rowHeights.length - 1] ?? 200;
  const rowHeights = [...table.rowHeights.slice(0, insertIndex), height, ...table.rowHeights.slice(insertIndex)];
  const cells = table.cells.map((cell) => (cell.row >= insertIndex ? { ...cell, row: cell.row + 1 } : cell));
  return { ...table, rows: table.rows + 1, rowHeights, cells };
}

function deleteRowAt(table: CadTableEntity, at: number): CadTableEntity {
  const rowHeights = [...table.rowHeights.slice(0, at), ...table.rowHeights.slice(at + 1)];
  const cells = table.cells
    .filter((cell) => cell.row !== at)
    .map((cell) => (cell.row > at ? { ...cell, row: cell.row - 1 } : cell));
  return { ...table, rows: table.rows - 1, rowHeights, cells };
}

function insertColumnAt(table: CadTableEntity, insertIndex: number, widthSource: number): CadTableEntity {
  const width = table.columnWidths[widthSource] ?? table.columnWidths[table.columnWidths.length - 1] ?? 1_000;
  const columnWidths = [
    ...table.columnWidths.slice(0, insertIndex),
    width,
    ...table.columnWidths.slice(insertIndex),
  ];
  const cells = table.cells.map((cell) =>
    cell.column >= insertIndex ? { ...cell, column: cell.column + 1 } : cell,
  );
  return { ...table, columns: table.columns + 1, columnWidths, cells };
}

function deleteColumnAt(table: CadTableEntity, at: number): CadTableEntity {
  const columnWidths = [...table.columnWidths.slice(0, at), ...table.columnWidths.slice(at + 1)];
  const cells = table.cells
    .filter((cell) => cell.column !== at)
    .map((cell) => (cell.column > at ? { ...cell, column: cell.column - 1 } : cell));
  return { ...table, columns: table.columns - 1, columnWidths, cells };
}

/** El rectángulo que de verdad ocupa una celda, span incluido (no sólo su ancla). */
function footprint(cell: CadTableCell): { r0: number; r1: number; c0: number; c1: number } {
  const rows = Math.max(1, Math.floor(cell.rowSpan ?? 1));
  const columns = Math.max(1, Math.floor(cell.columnSpan ?? 1));
  return { r0: cell.row, r1: cell.row + rows - 1, c0: cell.column, c1: cell.column + columns - 1 };
}

function intersects(
  a: { r0: number; r1: number; c0: number; c1: number },
  b: { r0: number; r1: number; c0: number; c1: number },
): boolean {
  return a.r0 <= b.r1 && b.r0 <= a.r1 && a.c0 <= b.c1 && b.c0 <= a.c1;
}

function contains(
  outer: { r0: number; r1: number; c0: number; c1: number },
  inner: { r0: number; r1: number; c0: number; c1: number },
): boolean {
  return inner.r0 >= outer.r0 && inner.r1 <= outer.r1 && inner.c0 >= outer.c0 && inner.c1 <= outer.c1;
}

function mergeRegion(
  table: CadTableEntity,
  rowA: number,
  columnA: number,
  rowB: number,
  columnB: number,
): CadTableEntity | { error: string } {
  const r0 = Math.min(rowA, rowB);
  const r1 = Math.max(rowA, rowB);
  const c0 = Math.min(columnA, columnB);
  const c1 = Math.max(columnA, columnB);
  if (r0 === r1 && c0 === c1)
    return { error: "Fusionar necesita más de una celda; las dos designadas son la misma." };
  const target = { r0, r1, c0, c1 };
  // Una celda YA fusionada (rowSpan/columnSpan > 1) cuyo rectángulo se cruza con
  // el objetivo pero no cabe entero dentro: fusionar de todos modos dejaría DOS
  // celdas fusionadas reclamando la misma casilla (ver el caso "se cruza" en
  // annotate-table-structure.spec.ts). Si el objetivo la CONTIENE entera, en
  // cambio, es un agrandar legítimo — la vieja fusión desaparece dentro de la
  // nueva, como en AutoCAD (ver el caso "agrandar" en el mismo spec).
  for (const cell of table.cells) {
    if ((cell.rowSpan ?? 1) <= 1 && (cell.columnSpan ?? 1) <= 1) continue;
    const existing = footprint(cell);
    if (intersects(existing, target) && !contains(target, existing))
      return {
        error: `Fusionar se cruza con la celda ya fusionada de la fila ${cell.row + 1}, columna ${cell.column + 1}; designe una región que la incluya entera.`,
      };
  }
  const anchor = table.cells.find((cell) => cell.row === r0 && cell.column === c0);
  const survivors = table.cells.filter(
    (cell) => !(cell.row >= r0 && cell.row <= r1 && cell.column >= c0 && cell.column <= c1),
  );
  const merged: CadTableCell = {
    ...(anchor ?? { row: r0, column: c0, text: "" }),
    row: r0,
    column: c0,
    rowSpan: r1 - r0 + 1,
    columnSpan: c1 - c0 + 1,
  };
  const cells = [...survivors, merged].sort((a, b) => a.row - b.row || a.column - b.column);
  return { ...table, cells };
}

function finish(
  state: StructureState,
  table: CadTableEntity,
  label: string,
): CadCommandStep<StructureState> {
  const recalculated = { ...table, cells: cadRecalcTableFormulas(table) };
  return cadCommandWrites(
    state,
    [{ type: "replace", entityId: state.entityId!, entity: recalculated as unknown as CadNativeEntity }],
    label,
  );
}

const tableStructureCommand: CadCommandDescriptor<StructureState> = {
  name: "TINSERT",
  aliases: [],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    const [first] = context.selection;
    return first ? designar(first, context) : paso(VACIO);
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);
    if (input.kind === "entityPick") return designar(input.entityId, context);
    if (input.kind === "selection") {
      const [first] = input.entityIds;
      return first ? designar(first, context) : paso(state);
    }
    if (!state.entityId) return paso(state);

    if (input.kind === "keyword") {
      if (state.action) return paso(state);
      const action = ACTION_BY_KEYWORD[input.keyword];
      if (!action) return paso(state);
      return paso({
        ...state,
        action,
        pending: action === "merge" ? "merge-row1" : "index",
      });
    }

    if (!state.action) return paso(state);

    const numero =
      input.kind === "distance" ? input.value : input.kind === "text" ? Number(input.value) : NaN;
    if (input.kind !== "distance" && input.kind !== "text") return paso(state);

    const entity = context.entity?.(state.entityId);
    if (!entity || entity.type !== "table")
      return cadCommandRefused(state, `La tabla ${state.entityId} ya no está en el dibujo.`);
    const table = entity as unknown as CadTableEntity;

    if (state.action !== "merge") {
      const max = isRowAction(state.action) ? state.rows : state.columns;
      const at = indice(numero, max);
      if (at === null)
        return cadCommandRefused(
          state,
          `${isRowAction(state.action) ? "La fila" : "La columna"} tiene que estar entre 1 y ${max}.`,
        );
      if (state.action === "row-above") return finish(state, insertRowAt(table, at, at), "TINSERT");
      if (state.action === "row-below") return finish(state, insertRowAt(table, at + 1, at), "TINSERT");
      if (state.action === "row-delete") {
        if (state.rows <= 1)
          return cadCommandRefused(state, "TINSERT no puede dejar la tabla sin filas.");
        return finish(state, deleteRowAt(table, at), "TINSERT");
      }
      if (state.action === "column-left") return finish(state, insertColumnAt(table, at, at), "TINSERT");
      if (state.action === "column-right") return finish(state, insertColumnAt(table, at + 1, at), "TINSERT");
      if (state.action === "column-delete") {
        if (state.columns <= 1)
          return cadCommandRefused(state, "TINSERT no puede dejar la tabla sin columnas.");
        return finish(state, deleteColumnAt(table, at), "TINSERT");
      }
      return paso(state);
    }

    // Fusionar: cuatro números en dos celdas opuestas.
    if (state.pending === "merge-row1") {
      const row = indice(numero, state.rows);
      if (row === null) return cadCommandRefused(state, `La fila tiene que estar entre 1 y ${state.rows}.`);
      return paso({ ...state, mergeRow1: row, pending: "merge-col1" });
    }
    if (state.pending === "merge-col1") {
      const column = indice(numero, state.columns);
      if (column === null)
        return cadCommandRefused(state, `La columna tiene que estar entre 1 y ${state.columns}.`);
      return paso({ ...state, mergeColumn1: column, pending: "merge-row2" });
    }
    if (state.pending === "merge-row2") {
      const row = indice(numero, state.rows);
      if (row === null) return cadCommandRefused(state, `La fila tiene que estar entre 1 y ${state.rows}.`);
      return paso({ ...state, mergeRow2: row, pending: "merge-col2" });
    }
    // merge-col2: la última cifra, y se remata.
    const column = indice(numero, state.columns);
    if (column === null)
      return cadCommandRefused(state, `La columna tiene que estar entre 1 y ${state.columns}.`);
    const merged = mergeRegion(table, state.mergeRow1!, state.mergeColumn1!, state.mergeRow2!, column);
    if ("error" in merged) return cadCommandRefused(state, merged.error);
    return finish(state, merged, "TINSERT");
  },
};

export const CAD_TABLE_STRUCTURE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(tableStructureCommand),
];
