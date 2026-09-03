/**
 * TEXT, MTEXT y DDEDIT.
 *
 * El modelo canónico tiene MTEXT desde el esquema 3, con su maqueta, su
 * adaptador, sus grips y sus propiedades. Lo que no había era la PUERTA: no se
 * podía teclear `T` y escribir un rótulo. Un plano sin texto no es un plano.
 *
 * ## Por qué TEXT también produce un MTEXT
 *
 * El esquema tiene un tipo `text` HEREDADO, pero no está en `CadNativeEntity`:
 * no tiene adaptador, así que no se dibuja, no se selecciona y no se puede
 * transformar. Crear uno desde una orden nueva sería fabricar geometría muerta.
 *
 * Así que `TEXT` crea un MTEXT de una sola línea, con el ancho AJUSTADO al
 * texto medido para que nunca se parta —un TEXT de AutoCAD no se ajusta— y
 * `DT`/`TEXT` siguen significando lo que significan al teclearlos. La diferencia
 * con MTEXT queda en el gesto (punto y altura contra caja de dos esquinas), que
 * es lo que separa las dos órdenes en la práctica.
 *
 * ## Los códigos de control
 *
 * `\P`, `\L`, `\S`, `\f`, `\C` y `\H` los interpreta `mtext-codes.ts`. La orden
 * no los reescribe: lo que se teclea es lo que se guarda. Lo único que añade es
 * la opción `Apilar`, que pregunta superior e inferior y compone el `\S…;` — sin
 * ella hay que saberse la sintaxis de memoria para escribir una tolerancia, y
 * ése es exactamente el trámite que hace que la gente ponga el texto a mano.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadNativeEntity } from "../../entity-runtime";
import { cadMTextPlainText, cadMTextStackCode } from "../../mtext-codes";
import { measureCadMText } from "../../mtext-layout";
import {
  CAD_ACCEPT_ANGLE,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import {
  cadCommandCancelled,
  cadCommandRefused,
  cadCommandWrites,
  flat,
} from "./annotate-support";

const DEFAULT_HEIGHT = 120;
const MAX_TEXT_LENGTH = 8_192;

type Alignment = NonNullable<Extract<CadNativeEntity, { type: "mtext" }>["alignment"]>;

const JUSTIFY = { keyword: "Justificar", shortcut: "J" } as const;
const STYLE_OPTION = { keyword: "Estilo", shortcut: "E" } as const;
const HEIGHT_OPTION = { keyword: "Altura", shortcut: "A" } as const;
const ROTATION_OPTION = { keyword: "Rotación", shortcut: "R" } as const;
const SPACING_OPTION = { keyword: "Interlineado", shortcut: "I" } as const;
const COLUMNS_OPTION = { keyword: "Columnas", shortcut: "C" } as const;
const STACK_OPTION = { keyword: "Apilar", shortcut: "P" } as const;

const LEFT = { keyword: "Izquierda", shortcut: "I" } as const;
const CENTER = { keyword: "Centro", shortcut: "C" } as const;
const RIGHT = { keyword: "Derecha", shortcut: "D" } as const;

const JUSTIFY_TO_ALIGNMENT: Readonly<Record<string, Alignment>> = {
  [LEFT.keyword]: "top-left",
  [CENTER.keyword]: "top-center",
  [RIGHT.keyword]: "top-right",
};

/**
 * Ancho de la caja de un texto de UNA línea.
 *
 * Se mide en vez de dejarlo indefinido porque la maqueta, sin ancho, ajusta a
 * veinte veces la altura: un rótulo largo se partiría solo, y un TEXT no se
 * parte nunca. Se mide el texto ya SIN códigos: medir `\S1^2;` daría el ancho de
 * diez caracteres para lo que se dibuja como una fracción.
 */
function singleLineWidth(text: string, height: number, fontFamily?: string): number {
  const plain = cadMTextPlainText(text).split("\n");
  const widest = Math.max(...plain.map((line) => measureCadMText(line, height, { fontFamily })));
  return Math.max(height, widest);
}

// ---------------------------------------------------------------------------
// TEXT
// ---------------------------------------------------------------------------

type TextPending = "insertion" | "justify" | "style" | "height" | "rotation" | "text";

interface TextState {
  insertion: CadPoint2 | null;
  height: number;
  rotationDeg: number;
  alignment: Alignment;
  style: string;
  pending: TextPending;
}

const TEXT_PROMPTS: Readonly<Record<TextPending, string>> = {
  insertion: "Precise el punto inicial del texto",
  justify: "Precise la justificación",
  style: "Escriba el nombre del estilo de texto",
  height: "Precise la altura del texto",
  rotation: "Precise el ángulo de rotación del texto",
  text: "Escriba el texto",
};

function textStep(state: TextState, context: CadCommandContext): CadCommandStep<TextState> {
  const options =
    state.pending === "insertion"
      ? [JUSTIFY, STYLE_OPTION]
      : state.pending === "justify"
        ? [LEFT, CENTER, RIGHT]
        : [];
  return {
    state,
    prompt: {
      message: TEXT_PROMPTS[state.pending],
      options,
      ...(state.pending === "height" ? { defaultValue: String(state.height) } : {}),
      ...(state.pending === "rotation" ? { defaultValue: String(state.rotationDeg) } : {}),
    },
    accepts:
      state.pending === "insertion"
        ? CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD
        : state.pending === "justify"
          ? CAD_ACCEPT_KEYWORD
          : state.pending === "height"
            ? CAD_ACCEPT_DISTANCE
            : state.pending === "rotation"
              ? CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE
              : CAD_ACCEPT_TEXT,
    preview: state.insertion && context.cursor ? [{ points: [state.insertion, context.cursor] }] : [],
  };
}

function textFinish(
  state: TextState,
  value: string,
  context: CadCommandContext,
): CadCommandStep<TextState> {
  const text = value.slice(0, MAX_TEXT_LENGTH);
  if (!text.trim()) return cadCommandCancelled(state);
  const entity: CadNativeEntity = {
    id: context.newEntityId(),
    type: "mtext",
    insertion: flat(state.insertion!),
    text,
    height: state.height,
    width: singleLineWidth(text, state.height),
    alignment: state.alignment,
    ...(state.rotationDeg !== 0 ? { rotation: state.rotationDeg } : {}),
    ...(state.style !== "Standard" ? { style: state.style } : {}),
    layer: context.activeLayer,
  };
  return cadCommandWrites(state, [{ type: "insert", entity }], "TEXT");
}

const textCommand: CadCommandDescriptor<TextState> = {
  name: "TEXT",
  aliases: ["DT", "DTEXT"],
  kind: "annotate",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) =>
    textStep(
      {
        insertion: null,
        height: DEFAULT_HEIGHT,
        rotationDeg: 0,
        alignment: "top-left",
        style: "Standard",
        pending: "insertion",
      },
      context,
    ),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);

    if (input.kind === "keyword") {
      if (input.keyword === JUSTIFY.keyword) return textStep({ ...state, pending: "justify" }, context);
      if (input.keyword === STYLE_OPTION.keyword) return textStep({ ...state, pending: "style" }, context);
      const alignment = JUSTIFY_TO_ALIGNMENT[input.keyword];
      if (alignment) return textStep({ ...state, alignment, pending: "insertion" }, context);
      return textStep(state, context);
    }

    if (input.kind === "point" && state.pending === "insertion")
      return textStep({ ...state, insertion: input.point, pending: "height" }, context);

    if (input.kind === "text") {
      if (state.pending === "style")
        return textStep(
          { ...state, style: input.value.trim().slice(0, 128) || "Standard", pending: "insertion" },
          context,
        );
      if (state.pending === "text") return textFinish(state, input.value, context);
      return textStep(state, context);
    }

    if (input.kind === "distance") {
      if (state.pending === "height") {
        const height = Math.abs(input.value);
        return textStep(
          { ...state, height: height > 1e-9 ? height : state.height, pending: "rotation" },
          context,
        );
      }
      if (state.pending === "rotation")
        return textStep({ ...state, rotationDeg: input.value, pending: "text" }, context);
    }

    if (input.kind === "angle" && state.pending === "rotation")
      return textStep({ ...state, rotationDeg: input.degrees, pending: "text" }, context);

    if (input.kind === "enter") {
      // Enter acepta lo propuesto y avanza; en el paso del texto, un Enter sin
      // nada escrito es «no quiero rótulo», no un rótulo vacío.
      if (state.pending === "height") return textStep({ ...state, pending: "rotation" }, context);
      if (state.pending === "rotation") return textStep({ ...state, pending: "text" }, context);
      return cadCommandCancelled(state);
    }

    return textStep(state, context);
  },
};

// ---------------------------------------------------------------------------
// MTEXT
// ---------------------------------------------------------------------------

type MTextPending =
  | "first"
  | "opposite"
  | "height"
  | "rotation"
  | "spacing"
  | "columns"
  | "justify"
  | "text"
  | "stack-upper"
  | "stack-lower";

interface MTextState {
  first: CadPoint2 | null;
  opposite: CadPoint2 | null;
  height: number;
  rotationDeg: number;
  lineSpacing: number;
  columns: number;
  alignment: Alignment;
  text: string;
  stackUpper: string;
  pending: MTextPending;
}

const MTEXT_PROMPTS: Readonly<Record<MTextPending, string>> = {
  first: "Precise la primera esquina del párrafo",
  opposite: "Precise la esquina opuesta",
  height: "Precise la altura del texto",
  rotation: "Precise el ángulo de rotación del párrafo",
  spacing: "Precise el factor de interlineado",
  columns: "Precise el número de columnas",
  justify: "Precise la justificación",
  text: "Escriba el párrafo (\\P salta de línea)",
  "stack-upper": "Escriba la parte superior del apilado",
  "stack-lower": "Escriba la parte inferior del apilado",
};

function mtextStep(state: MTextState, context: CadCommandContext): CadCommandStep<MTextState> {
  const options =
    state.pending === "opposite"
      ? [HEIGHT_OPTION, JUSTIFY, ROTATION_OPTION, SPACING_OPTION, COLUMNS_OPTION]
      : state.pending === "justify"
        ? [LEFT, CENTER, RIGHT]
        : state.pending === "text"
          ? [STACK_OPTION]
          : [];
  const textual = state.pending === "text" || state.pending.startsWith("stack-");
  return {
    state,
    prompt: {
      message: MTEXT_PROMPTS[state.pending],
      options,
      ...(state.pending === "height" ? { defaultValue: String(state.height) } : {}),
      ...(state.pending === "spacing" ? { defaultValue: String(state.lineSpacing) } : {}),
      ...(state.pending === "columns" ? { defaultValue: String(state.columns) } : {}),
      ...(state.pending === "rotation" ? { defaultValue: String(state.rotationDeg) } : {}),
    },
    accepts: textual
      ? CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD
      : state.pending === "first"
        ? CAD_ACCEPT_POINT
        : state.pending === "opposite"
          ? CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD
          : state.pending === "justify"
            ? CAD_ACCEPT_KEYWORD
            : state.pending === "rotation"
              ? CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE
              : CAD_ACCEPT_DISTANCE,
    preview:
      state.first && context.cursor
        ? [
            {
              points: [
                state.first,
                { x: context.cursor.x, y: state.first.y },
                context.cursor,
                { x: state.first.x, y: context.cursor.y },
              ],
              closed: true,
            },
          ]
        : [],
  };
}

/**
 * Añade un párrafo al texto acumulado.
 *
 * Cada línea tecleada es un párrafo nuevo, separado con `\P`, y `Apilar` se pega
 * al párrafo EN CURSO. Esa es la diferencia entre las dos órdenes: `TEXT` remata
 * con la primera línea porque un TEXT es una línea, y `MTEXT` acumula hasta que
 * se pulsa Enter con la caja vacía, que es el gesto con el que se cierra el
 * editor en sitio.
 */
function appendParagraph(text: string, value: string): string {
  if (!value) return text;
  return text ? `${text}\\P${value}` : value;
}

function mtextFinish(state: MTextState, context: CadCommandContext): CadCommandStep<MTextState> {
  const text = state.text.slice(0, MAX_TEXT_LENGTH);
  if (!text.trim()) return cadCommandCancelled(state);
  const first = state.first!;
  const opposite = state.opposite!;
  // El punto de inserción de un MTEXT alineado arriba a la izquierda es la
  // esquina SUPERIOR IZQUIERDA de la caja, sea cual sea el orden en que se
  // marcaron las dos esquinas: si se tomara la primera tal cual, arrastrar de
  // abajo a arriba dejaría el párrafo fuera del recuadro que se acaba de dibujar.
  const insertion = { x: Math.min(first.x, opposite.x), y: Math.max(first.y, opposite.y) };
  const width = Math.max(state.height, Math.abs(opposite.x - first.x));
  const entity: CadNativeEntity = {
    id: context.newEntityId(),
    type: "mtext",
    insertion: flat(insertion),
    text,
    height: state.height,
    width,
    alignment: state.alignment,
    ...(state.rotationDeg !== 0 ? { rotation: state.rotationDeg } : {}),
    ...(state.lineSpacing !== 1.2 ? { lineSpacing: state.lineSpacing } : {}),
    ...(state.columns > 1 ? { columns: state.columns } : {}),
    layer: context.activeLayer,
  };
  return cadCommandWrites(state, [{ type: "insert", entity }], "MTEXT");
}

const mtextCommand: CadCommandDescriptor<MTextState> = {
  name: "MTEXT",
  aliases: ["T", "MT"],
  kind: "annotate",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) =>
    mtextStep(
      {
        first: null,
        opposite: null,
        height: DEFAULT_HEIGHT,
        rotationDeg: 0,
        lineSpacing: 1.2,
        columns: 1,
        alignment: "top-left",
        text: "",
        stackUpper: "",
        pending: "first",
      },
      context,
    ),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);

    if (input.kind === "keyword") {
      if (input.keyword === HEIGHT_OPTION.keyword) return mtextStep({ ...state, pending: "height" }, context);
      if (input.keyword === ROTATION_OPTION.keyword) return mtextStep({ ...state, pending: "rotation" }, context);
      if (input.keyword === SPACING_OPTION.keyword) return mtextStep({ ...state, pending: "spacing" }, context);
      if (input.keyword === COLUMNS_OPTION.keyword) return mtextStep({ ...state, pending: "columns" }, context);
      if (input.keyword === JUSTIFY.keyword) return mtextStep({ ...state, pending: "justify" }, context);
      if (input.keyword === STACK_OPTION.keyword && state.pending === "text")
        return mtextStep({ ...state, pending: "stack-upper" }, context);
      const alignment = JUSTIFY_TO_ALIGNMENT[input.keyword];
      if (alignment) return mtextStep({ ...state, alignment, pending: "opposite" }, context);
      return mtextStep(state, context);
    }

    if (input.kind === "point") {
      if (state.pending === "first") return mtextStep({ ...state, first: input.point, pending: "opposite" }, context);
      if (state.pending === "opposite")
        return mtextStep({ ...state, opposite: input.point, pending: "text" }, context);
    }

    if (input.kind === "text") {
      if (state.pending === "stack-upper")
        return mtextStep({ ...state, stackUpper: input.value, pending: "stack-lower" }, context);
      if (state.pending === "stack-lower")
        return mtextStep(
          {
            ...state,
            text: `${state.text}${cadMTextStackCode(state.stackUpper, input.value)}`,
            stackUpper: "",
            pending: "text",
          },
          context,
        );
      if (state.pending === "text")
        return mtextStep({ ...state, text: appendParagraph(state.text, input.value) }, context);
      return mtextStep(state, context);
    }

    if (input.kind === "distance") {
      if (state.pending === "height") {
        const height = Math.abs(input.value);
        return mtextStep(
          { ...state, height: height > 1e-9 ? height : state.height, pending: "opposite" },
          context,
        );
      }
      if (state.pending === "spacing") {
        const spacing = Math.abs(input.value);
        return mtextStep(
          { ...state, lineSpacing: spacing > 0.05 ? spacing : state.lineSpacing, pending: "opposite" },
          context,
        );
      }
      if (state.pending === "columns") {
        const columns = Math.round(Math.abs(input.value));
        if (columns < 1 || columns > 8)
          return cadCommandRefused(state, `Un MTEXT admite entre 1 y 8 columnas; se pidieron ${columns}.`);
        return mtextStep({ ...state, columns, pending: "opposite" }, context);
      }
      if (state.pending === "rotation")
        return mtextStep({ ...state, rotationDeg: input.value, pending: "opposite" }, context);
    }

    if (input.kind === "angle" && state.pending === "rotation")
      return mtextStep({ ...state, rotationDeg: input.degrees, pending: "opposite" }, context);

    if (input.kind === "enter") {
      // Enter en el paso del texto REMATA el párrafo con lo acumulado: es la
      // única forma de cerrar un MTEXT construido a base de apilados.
      if (state.pending === "text") return mtextFinish(state, context);
      if (state.pending === "height" || state.pending === "spacing" || state.pending === "columns" || state.pending === "rotation")
        return mtextStep({ ...state, pending: "opposite" }, context);
      return cadCommandCancelled(state);
    }

    return mtextStep(state, context);
  },
};

// ---------------------------------------------------------------------------
// DDEDIT
// ---------------------------------------------------------------------------

interface DdeditState {
  entityId: string | null;
  current: string;
}

/** Tipos cuyo texto se puede reeditar, y con qué propiedad se escribe. */
const EDITABLE_TEXT_PROPERTY: Readonly<Record<string, string>> = {
  // TEXT de una línea: faltaba, y es la mitad de los rótulos de un plano
  // heredado. En AutoCAD el doble clic sobre un TEXT abre su editor igual que
  // sobre un MTEXT; sin esta fila, DDEDIT lo rechazaba diciendo que «no lleva
  // texto» sobre una entidad cuyo único contenido ES texto.
  text: "text",
  mtext: "text",
  mleader: "text",
  dimension: "textOverride",
  attdef: "defaultValue",
};

function currentTextOf(entityType: string, entity: Record<string, unknown>): string {
  const key = EDITABLE_TEXT_PROPERTY[entityType];
  const value = key ? entity[key === "textOverride" ? "text" : key] : undefined;
  return typeof value === "string" ? value : "";
}

function ddeditPrompt(state: DdeditState): CadCommandStep<DdeditState> {
  if (!state.entityId)
    return {
      state,
      prompt: { message: "Designe el objeto de anotación a editar", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  return {
    state,
    prompt: {
      message: "Escriba el texto nuevo",
      options: [],
      ...(state.current ? { defaultValue: state.current } : {}),
    },
    accepts: CAD_ACCEPT_TEXT,
  };
}

function ddeditSelect(entityId: string, context: CadCommandContext): CadCommandStep<DdeditState> {
  const entity = context.entity?.(entityId);
  const state: DdeditState = { entityId: null, current: "" };
  if (!entity)
    return cadCommandRefused(state, `No encuentro el objeto ${entityId} en este dibujo.`);
  if (!EDITABLE_TEXT_PROPERTY[entity.type])
    return cadCommandRefused(
      state,
      `DDEDIT edita anotaciones (MTEXT, MLEADER, cotas y atributos); ${entity.type.toUpperCase()} no lleva texto.`,
    );
  return ddeditPrompt({
    entityId,
    current: currentTextOf(entity.type, entity as unknown as Record<string, unknown>),
  });
}

const ddeditCommand: CadCommandDescriptor<DdeditState> = {
  name: "DDEDIT",
  aliases: ["ED", "TEXTEDIT"],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    const [first] = context.selection;
    return first ? ddeditSelect(first, context) : ddeditPrompt({ entityId: null, current: "" });
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);
    if (input.kind === "entityPick") return ddeditSelect(input.entityId, context);
    if (input.kind === "selection") {
      const [first] = input.entityIds;
      return first ? ddeditSelect(first, context) : ddeditPrompt(state);
    }
    if (input.kind === "text" && state.entityId) {
      const entity = context.entity?.(state.entityId);
      if (!entity) return cadCommandRefused(state, `El objeto ${state.entityId} ya no está en el dibujo.`);
      const property = EDITABLE_TEXT_PROPERTY[entity.type];
      if (!property) return cadCommandRefused(state, `${entity.type.toUpperCase()} no lleva texto editable.`);
      const value = input.value.slice(0, MAX_TEXT_LENGTH);
      return cadCommandWrites(
        state,
        [{ type: "properties", entityId: state.entityId, patch: { [property]: value } }],
        "DDEDIT",
      );
    }
    // Enter sin texto deja el rótulo como estaba: reeditar y no cambiar nada no
    // debe ensuciar la historia con un paso de deshacer vacío.
    if (input.kind === "enter") return cadCommandCancelled(state);
    return ddeditPrompt(state);
  },
};

export const CAD_ANNOTATE_TEXT_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(textCommand),
  asCadCommand(mtextCommand),
  asCadCommand(ddeditCommand),
];

export const __testables = { singleLineWidth };
