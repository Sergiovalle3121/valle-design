/**
 * TABLEDIT — cambiar lo que dice una celda, y su fórmula si la lleva.
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
 * Una celda: fila, columna, texto — y, si el texto empieza por `=`, una
 * fórmula (`tables/table-formulas.ts`). Cambiar estilos por celda o traer los
 * datos de un enlace (`DATALINK`) NO están: son órdenes propias de AutoCAD que
 * prometerlas aquí sería exactamente el «éxito falso» que
 * `check:command-integrity` persigue. Insertar/borrar filas y columnas y
 * fusionar celdas SÍ existen, pero en `TINSERT`
 * (`annotate-table-structure.ts`): son operaciones de REJILLA, no de una
 * celda, y mezclarlas aquí habría hecho de esta orden dos máquinas de estados
 * en una. `TABLEEXPORT` (`annotate-table-export.ts`) sirve al csv.
 *
 * ## Fórmulas: se recalcula TODA la tabla, no sólo la celda tecleada
 *
 * Editar A1 puede cambiar lo que muestra `=SUMA(A1:A5)` en otra celda. Por eso
 * cada escritura pasa la tabla entera por `cadRecalcTableFormulas`: es el
 * mismo criterio que `UPDATEFIELD` aplica a los campos del dibujo (barato de
 * recorrer, imposible de acertar a medias) y evita el bug de «edité el total y
 * ahora dice lo de ayer» sin que ninguna orden lo pidiera.
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
import { cadRecalcTableFormulas } from "../../tables/table-formulas";
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

/**
 * Lo que se ofrece para reeditar una celda: su FÓRMULA si la lleva —para que
 * reeditar una celda calculada no la convierta en texto plano por accidente—,
 * y si no, su texto tal cual. Cadena vacía si la celda todavía no existe.
 */
function textoDe(table: CadTableEntity, row: number, column: number): string {
  const cell = table.cells.find((item) => item.row === row && item.column === column);
  return cell?.formula ?? cell?.text ?? "";
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
    // Empieza por `=`: es una fórmula, y `text` la lleva vacía hasta que el
    // recálculo de más abajo le ponga el valor. Cualquier otra cosa es texto
    // llano, y si la celda tenía fórmula antes queda retirada — teclear encima
    // de una fórmula es decir «esto ya no se calcula».
    const typed = input.value;
    const isFormula = typed.trim().startsWith("=");
    const nextCell = isFormula
      ? { row: state.row, column: state.column, text: "", formula: typed.trim() }
      : { row: state.row, column: state.column, text: typed };
    const cells = [
      ...table.cells.filter((cell) => !(cell.row === state.row && cell.column === state.column)),
      nextCell,
    ].sort((a, b) => a.row - b.row || a.column - b.column);
    const recalculated = cadRecalcTableFormulas({ ...table, cells });
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
          entity: { ...table, cells: recalculated } as unknown as CadNativeEntity,
        },
      ],
      "TABLEDIT",
    );
  },
};

export const CAD_TABLE_EDIT_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(tableEditCommand),
];
