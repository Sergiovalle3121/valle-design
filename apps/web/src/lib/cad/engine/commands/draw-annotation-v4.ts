/**
 * ATTDEF y TABLE.
 *
 * ## ATTDEF: la etiqueta es un IDENTIFICADOR, no un rótulo
 *
 * `tag` es lo que un INSERT usa para resolver el atributo, así que no admite
 * espacios ni queda vacía: un ATTDEF con la etiqueta en blanco no lo encuentra
 * ningún bloque y el cajetín sale sin rellenar sin que nada avise. Se normaliza
 * al aceptarla —espacios a guion bajo, mayúsculas— y se rechaza la vacía.
 *
 * `prompt` y `defaultValue` sí son texto libre: el primero es lo que se le
 * pregunta a quien inserte el bloque y el segundo lo que se propone.
 *
 * ## TABLE crece hacia ABAJO
 *
 * El punto de inserción es la esquina SUPERIOR IZQUIERDA. Es la convención de
 * AutoCAD y la que hace que una tabla anclada al borde de un cajetín no se
 * salga por arriba al añadirle filas. La orden pide filas, columnas, alto de
 * fila y ancho de columna, y crea la rejilla con celdas vacías: rellenarlas es
 * trabajo del editor de tablas, no de la orden que la crea.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadNativeEntity } from "../../entity-runtime";
import {
  CAD_ACCEPT_ANGLE,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const flat = (point: CadPoint2) => ({ x: point.x, y: point.y, z: 0 });

// ---------------------------------------------------------------------------
// ATTDEF
// ---------------------------------------------------------------------------

const INVISIBLE = { keyword: "Invisible", shortcut: "I" } as const;
const CONSTANT = { keyword: "Constante", shortcut: "C" } as const;
const VERIFY = { keyword: "Verificar", shortcut: "V" } as const;
const PRESET = { keyword: "Predefinido", shortcut: "P" } as const;

type AttdefPending = "tag" | "prompt" | "default" | "insertion" | "height" | "rotation";

interface AttdefState {
  tag: string;
  prompt: string;
  defaultValue: string;
  insertion: CadPoint2 | null;
  height: number;
  invisible: boolean;
  constant: boolean;
  verify: boolean;
  preset: boolean;
  pending: AttdefPending;
}

/** Normaliza una etiqueta de atributo: sin espacios, en mayúsculas, acotada. */
export function normalizeAttributeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, "_").toUpperCase().slice(0, 128);
}

const ATTDEF_PROMPTS: Record<AttdefPending, string> = {
  tag: "Precise la etiqueta del atributo",
  prompt: "Precise el mensaje que se mostrará al insertar",
  default: "Precise el valor por defecto",
  insertion: "Precise el punto de inserción del atributo",
  height: "Precise la altura del texto",
  rotation: "Precise la rotación del texto",
};

function attdefStep(state: AttdefState, context: CadCommandContext): CadCommandStep<AttdefState> {
  const textual = state.pending === "tag" || state.pending === "prompt" || state.pending === "default";
  return {
    state,
    prompt: {
      message: ATTDEF_PROMPTS[state.pending],
      options: state.pending === "tag" ? [INVISIBLE, CONSTANT, VERIFY, PRESET] : [],
      ...(state.pending === "height" ? { defaultValue: "120" } : {}),
      ...(state.pending === "rotation" ? { defaultValue: "0" } : {}),
    },
    accepts: textual
      ? CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD
      : state.pending === "insertion"
        ? CAD_ACCEPT_POINT
        : state.pending === "rotation"
          ? CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE
          : CAD_ACCEPT_DISTANCE,
    preview: state.insertion && context.cursor ? [{ points: [state.insertion, context.cursor] }] : [],
  };
}

function attdefFinish(
  state: AttdefState,
  rotationDeg: number,
  context: CadCommandContext,
): CadCommandStep<AttdefState> {
  const entity: CadNativeEntity = {
    id: context.newEntityId(),
    type: "attdef",
    tag: state.tag,
    ...(state.prompt ? { prompt: state.prompt } : {}),
    ...(state.defaultValue ? { defaultValue: state.defaultValue } : {}),
    insertion: flat(state.insertion!),
    height: state.height,
    ...(rotationDeg !== 0 ? { rotation: rotationDeg } : {}),
    ...(state.invisible ? { invisible: true } : {}),
    ...(state.constant ? { constant: true } : {}),
    ...(state.verify ? { verify: true } : {}),
    ...(state.preset ? { preset: true } : {}),
    layer: context.activeLayer,
  };
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "document", commands: [{ type: "insert", entity }], label: "ATTDEF" },
  };
}

const attdefCommand: CadCommandDescriptor<AttdefState> = {
  name: "ATTDEF",
  aliases: ["ATT"],
  kind: "annotate",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) =>
    attdefStep(
      {
        tag: "",
        prompt: "",
        defaultValue: "",
        insertion: null,
        height: 120,
        invisible: false,
        constant: false,
        verify: false,
        preset: false,
        pending: "tag",
      },
      context,
    ),
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };

    if (input.kind === "keyword") {
      if (input.keyword === INVISIBLE.keyword)
        return attdefStep({ ...state, invisible: !state.invisible }, context);
      if (input.keyword === CONSTANT.keyword)
        return attdefStep({ ...state, constant: !state.constant }, context);
      if (input.keyword === VERIFY.keyword) return attdefStep({ ...state, verify: !state.verify }, context);
      if (input.keyword === PRESET.keyword) return attdefStep({ ...state, preset: !state.preset }, context);
      return attdefStep(state, context);
    }

    if (input.kind === "text") {
      if (state.pending === "tag") {
        const tag = normalizeAttributeTag(input.value);
        // Sin etiqueta no hay atributo: ningún INSERT sabría resolverlo y el
        // cajetín saldría vacío sin que nada avise.
        if (!tag)
          return {
            state,
            prompt: { message: "", options: [] },
            accepts: 0,
            result: { kind: "message", text: "Un atributo necesita una etiqueta no vacía." },
          };
        return attdefStep({ ...state, tag, pending: "prompt" }, context);
      }
      if (state.pending === "prompt")
        return attdefStep({ ...state, prompt: input.value.slice(0, 512), pending: "default" }, context);
      if (state.pending === "default")
        return attdefStep({ ...state, defaultValue: input.value.slice(0, 2_048), pending: "insertion" }, context);
      return attdefStep(state, context);
    }

    if (input.kind === "enter") {
      // Enter en los pasos de texto acepta el vacío y sigue; en los numéricos,
      // el valor propuesto.
      if (state.pending === "prompt") return attdefStep({ ...state, pending: "default" }, context);
      if (state.pending === "default") return attdefStep({ ...state, pending: "insertion" }, context);
      if (state.pending === "height") return attdefStep({ ...state, pending: "rotation" }, context);
      if (state.pending === "rotation" && state.insertion) return attdefFinish(state, 0, context);
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    }

    if (input.kind === "point" && state.pending === "insertion")
      return attdefStep({ ...state, insertion: input.point, pending: "height" }, context);

    if (input.kind === "angle" && state.pending === "rotation" && state.insertion)
      return attdefFinish(state, input.degrees, context);

    if (input.kind === "distance") {
      if (state.pending === "height") {
        const height = Math.abs(input.value);
        return attdefStep(
          { ...state, height: height > 1e-9 ? height : state.height, pending: "rotation" },
          context,
        );
      }
      if (state.pending === "rotation" && state.insertion) return attdefFinish(state, input.value, context);
    }
    return attdefStep(state, context);
  },
};

// ---------------------------------------------------------------------------
// TABLE
// ---------------------------------------------------------------------------

type TablePending = "rows" | "columns" | "row-height" | "column-width" | "insertion";

interface TableState {
  rows: number;
  columns: number;
  rowHeight: number;
  columnWidth: number;
  pending: TablePending;
}

const TABLE_PROMPTS: Record<TablePending, string> = {
  rows: "Precise el número de filas",
  columns: "Precise el número de columnas",
  "row-height": "Precise la altura de fila",
  "column-width": "Precise el ancho de columna",
  insertion: "Precise el punto de inserción (esquina superior izquierda)",
};

/** Límites: una tabla de un millón de celdas no es una tabla, es un cuelgue. */
const TABLE_MAX_ROWS = 512;
const TABLE_MAX_COLUMNS = 128;

function tableStep(state: TableState, context: CadCommandContext): CadCommandStep<TableState> {
  const defaults: Partial<Record<TablePending, string>> = {
    rows: "3",
    columns: "3",
    "row-height": "200",
    "column-width": "1000",
  };
  return {
    state,
    prompt: {
      message: TABLE_PROMPTS[state.pending],
      options: [],
      ...(defaults[state.pending] ? { defaultValue: defaults[state.pending] } : {}),
    },
    accepts: state.pending === "insertion" ? CAD_ACCEPT_POINT : CAD_ACCEPT_DISTANCE,
    preview: context.cursor && state.pending === "insertion" ? [{ points: [context.cursor] }] : [],
  };
}

function tableFinish(
  state: TableState,
  insertion: CadPoint2,
  context: CadCommandContext,
): CadCommandStep<TableState> {
  const entity: CadNativeEntity = {
    id: context.newEntityId(),
    type: "table",
    insertion: flat(insertion),
    rows: state.rows,
    columns: state.columns,
    rowHeights: Array.from({ length: state.rows }, () => state.rowHeight),
    columnWidths: Array.from({ length: state.columns }, () => state.columnWidth),
    // Celdas VACÍAS, no inventadas: la orden crea la rejilla y el contenido lo
    // pone quien la rellena.
    cells: [],
    layer: context.activeLayer,
  };
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "document", commands: [{ type: "insert", entity }], label: "TABLE" },
  };
}

const tableCommand: CadCommandDescriptor<TableState> = {
  name: "TABLE",
  aliases: ["TB"],
  kind: "annotate",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) =>
    tableStep({ rows: 3, columns: 3, rowHeight: 200, columnWidth: 1_000, pending: "rows" }, context),
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    const advance: Record<TablePending, TablePending> = {
      rows: "columns",
      columns: "row-height",
      "row-height": "column-width",
      "column-width": "insertion",
      insertion: "insertion",
    };
    if (input.kind === "enter") {
      if (state.pending === "insertion")
        return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
      return tableStep({ ...state, pending: advance[state.pending] }, context);
    }
    if (input.kind === "distance") {
      const value = input.value;
      if (state.pending === "rows") {
        const rows = Math.round(Math.abs(value));
        if (rows < 1 || rows > TABLE_MAX_ROWS)
          return {
            state,
            prompt: { message: "", options: [] },
            accepts: 0,
            result: {
              kind: "message",
              text: `Una tabla tiene entre 1 y ${TABLE_MAX_ROWS} filas; se pidieron ${rows}.`,
            },
          };
        return tableStep({ ...state, rows, pending: "columns" }, context);
      }
      if (state.pending === "columns") {
        const columns = Math.round(Math.abs(value));
        if (columns < 1 || columns > TABLE_MAX_COLUMNS)
          return {
            state,
            prompt: { message: "", options: [] },
            accepts: 0,
            result: {
              kind: "message",
              text: `Una tabla tiene entre 1 y ${TABLE_MAX_COLUMNS} columnas; se pidieron ${columns}.`,
            },
          };
        return tableStep({ ...state, columns, pending: "row-height" }, context);
      }
      if (state.pending === "row-height") {
        const rowHeight = Math.abs(value);
        return tableStep(
          { ...state, rowHeight: rowHeight > 1e-9 ? rowHeight : state.rowHeight, pending: "column-width" },
          context,
        );
      }
      if (state.pending === "column-width") {
        const columnWidth = Math.abs(value);
        return tableStep(
          { ...state, columnWidth: columnWidth > 1e-9 ? columnWidth : state.columnWidth, pending: "insertion" },
          context,
        );
      }
    }
    if (input.kind === "point" && state.pending === "insertion")
      return tableFinish(state, input.point, context);
    return tableStep(state, context);
  },
};

export const CAD_ANNOTATION_V4_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(attdefCommand),
  asCadCommand(tableCommand),
];
