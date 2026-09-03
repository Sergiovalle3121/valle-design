/**
 * TABLEDIT — cambiar lo que dice una celda.
 *
 * ## Por qué existe
 *
 * `docs/competitive/distancia-autocad-completo-20260903.md` lo cuenta entre lo
 * que falta del área de anotación, y el doble clic lo necesita: en AutoCAD, dos
 * clics sobre una tabla abren su celda. Sin esta orden, el doble clic sobre lo
 * único que un cuadro de cantidades ES —una tabla— no podía hacer nada.
 *
 * ## Qué edita, y qué no
 *
 * Una celda: fila, columna, texto. Se dice aquí y se dice en el prompt.
 * Insertar y borrar filas o columnas, fusionar celdas, cambiar estilos por
 * celda o traer los datos de un enlace (`DATALINK`) NO están: son órdenes
 * propias en AutoCAD (`TINSERT`, `TABLEXPORT`, `DATALINK`) y prometerlas dentro
 * de ésta sería exactamente el «éxito falso» que `check:command-integrity`
 * persigue.
 *
 * ## Por qué la celda se pide por FILA y COLUMNA
 *
 * Porque el motor no ve la pantalla. Designar la celda con el ratón exige saber
 * dónde cayó el clic DENTRO de la tabla, y eso es geometría de viewport. El
 * doble clic del estudio designa la TABLA; qué celda, lo dice el usuario. Es la
 * misma frontera que el resto del motor respeta: aquí, aritmética; allí,
 * píxeles.
 */
import type { CadTableEntity } from "../../cad-entities-v4";
import type { CadNativeEntity } from "../../entity-runtime";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_SELECTION,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import { cadCommandCancelled, cadCommandRefused, cadCommandWrites } from "./annotate-support";

interface TableEditState {
  entityId: string | null;
  rows: number;
  columns: number;
  row: number | null;
  column: number | null;
  current: string;
}

const VACIO: TableEditState = {
  entityId: null,
  rows: 0,
  columns: 0,
  row: null,
  column: null,
  current: "",
};

/** Texto de una celda, o cadena vacía si esa celda todavía no tiene fila. */
function textoDe(table: CadTableEntity, row: number, column: number): string {
  return table.cells.find((cell) => cell.row === row && cell.column === column)?.text ?? "";
}

function paso(state: TableEditState): CadCommandStep<TableEditState> {
  if (!state.entityId)
    return {
      state,
      prompt: { message: "Designe la tabla", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  if (state.row === null)
    return {
      state,
      prompt: {
        message: `Indique la fila (1 a ${state.rows})`,
        options: [],
        defaultValue: "1",
      },
      accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
    };
  if (state.column === null)
    return {
      state,
      prompt: {
        message: `Indique la columna (1 a ${state.columns})`,
        options: [],
        defaultValue: "1",
      },
      accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
    };
  return {
    state,
    prompt: {
      message: `Texto de la celda ${state.row + 1},${state.column + 1}`,
      options: [],
      ...(state.current ? { defaultValue: state.current } : {}),
    },
    accepts: CAD_ACCEPT_TEXT,
  };
}

function designar(entityId: string, context: CadCommandContext): CadCommandStep<TableEditState> {
  const entity = context.entity?.(entityId);
  if (!entity) return cadCommandRefused(VACIO, `No encuentro el objeto ${entityId} en este dibujo.`);
  if (entity.type !== "table")
    return cadCommandRefused(
      VACIO,
      `TABLEDIT edita tablas; ${entity.type.toUpperCase()} no lo es.`,
    );
  const table = entity as unknown as CadTableEntity;
  return paso({ ...VACIO, entityId, rows: table.rows, columns: table.columns });
}

/** Un índice 1-based tecleado, ya validado contra el tamaño de la tabla. */
function indice(raw: number, tope: number): number | null {
  const entero = Math.floor(raw);
  return Number.isFinite(entero) && entero >= 1 && entero <= tope ? entero - 1 : null;
}

const tableEditCommand: CadCommandDescriptor<TableEditState> = {
  name: "TABLEDIT",
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

    const numero =
      input.kind === "distance"
        ? input.value
        : input.kind === "text"
          ? Number(input.value)
          : NaN;

    if (state.row === null) {
      const row = input.kind === "enter" ? 0 : indice(numero, state.rows);
      if (row === null)
        return cadCommandRefused(state, `La fila tiene que estar entre 1 y ${state.rows}.`);
      return paso({ ...state, row });
    }
    if (state.column === null) {
      const column = input.kind === "enter" ? 0 : indice(numero, state.columns);
      if (column === null)
        return cadCommandRefused(state, `La columna tiene que estar entre 1 y ${state.columns}.`);
      const entity = context.entity?.(state.entityId);
      const current =
        entity && entity.type === "table"
          ? textoDe(entity as unknown as CadTableEntity, state.row, column)
          : "";
      return paso({ ...state, column, current });
    }
    // Enter sin texto deja la celda como estaba: reeditar y no cambiar nada no
    // debe ensuciar la historia con un paso de deshacer vacío.
    if (input.kind !== "text") return cadCommandCancelled(state);
    const entity = context.entity?.(state.entityId);
    if (!entity || entity.type !== "table")
      return cadCommandRefused(state, `La tabla ${state.entityId} ya no está en el dibujo.`);
    const table = entity as unknown as CadTableEntity;
    const cells = [
      ...table.cells.filter((cell) => !(cell.row === state.row && cell.column === state.column)),
      { row: state.row, column: state.column, text: input.value },
    ].sort((a, b) => a.row - b.row || a.column - b.column);
    // `replace` y no `properties`: un parche de propiedades sólo lleva escalares
    // (`CadPropertyValue = string | number | boolean`) y las celdas son una
    // lista. Reemplazar la entidad conserva su id, que es lo que mantiene vivas
    // las cotas asociativas y los sombreados que dependan de ella.
    return cadCommandWrites(
      state,
      [
        {
          type: "replace",
          entityId: state.entityId,
          entity: { ...table, cells } as unknown as CadNativeEntity,
        },
      ],
      "TABLEDIT",
    );
  },
};

export const CAD_TABLE_EDIT_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(tableEditCommand),
];
