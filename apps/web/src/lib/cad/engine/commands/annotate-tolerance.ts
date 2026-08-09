/**
 * TOLERANCE: el marco de control geométrico (GD&T).
 *
 * ## Lo que se materializa, y por qué NO es una entidad TOLERANCE
 *
 * El esquema 4 no tiene un tipo `tolerance`, y `cad-document.ts` es de otra
 * sesión. Así que el marco se materializa con la geometría que el documento SÍ
 * sabe guardar: una polilínea cerrada para el recuadro, una línea por cada
 * separador y un MTEXT por celda — todo en UN lote, así que es un solo paso de
 * deshacer.
 *
 * Eso tiene una consecuencia que conviene decir en voz alta y no descubrir
 * usándolo: **el marco no se mueve como un objeto**. Seleccionar sólo el texto y
 * arrastrarlo lo saca de su casilla. Para que no se pierda de qué marco es cada
 * pieza, todas las entidades del lote llevan `context.metadata.toleranceFrame`
 * con el mismo identificador; el día que el esquema gane su entidad —o que
 * existan grupos de verdad— eso es lo que permite recomponerlas.
 *
 * ## Los símbolos son los de la norma
 *
 * Se teclea el nombre de la característica y sale su símbolo. Un nombre que no
 * está en la tabla se RECHAZA enumerando los válidos, en vez de escribir el
 * texto tal cual: un marco de control con la palabra «paralelisno» dentro no es
 * un marco de control, es una nota que parece uno.
 *
 * El modificador de material (Ⓜ máximo, Ⓛ mínimo, Ⓢ indiferente) va pegado al
 * valor de la tolerancia, como en la norma, y los datums van cada uno en su
 * casilla.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import { measureCadMText } from "../../mtext-layout";
import {
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
import { cadCommandCancelled, cadCommandRefused, cadCommandWrites, flat } from "./annotate-support";

/**
 * Las catorce características geométricas de la norma, con su símbolo.
 *
 * Se aceptan por nombre en español porque es lo que se teclea; el símbolo es
 * invariante y es lo que se dibuja.
 */
const CHARACTERISTICS: Readonly<Record<string, string>> = {
  rectitud: "⏤",
  planitud: "⏥",
  circularidad: "○",
  redondez: "○",
  cilindricidad: "⌭",
  "perfil-linea": "⌒",
  "perfil-superficie": "⌓",
  paralelismo: "∥",
  perpendicularidad: "⊥",
  angularidad: "∠",
  posicion: "⌖",
  posición: "⌖",
  concentricidad: "◎",
  coaxialidad: "◎",
  simetria: "⌯",
  simetría: "⌯",
  alabeo: "↗",
  "alabeo-total": "⌰",
};

const MMC = { keyword: "Máximo", shortcut: "M" } as const;
const LMC = { keyword: "mÍnimo", shortcut: "I" } as const;
const RFS = { keyword: "iNdiferente", shortcut: "N" } as const;

/** Modificadores de condición de material, en el orden en que se ofrecen. */
const MATERIAL: Readonly<Record<string, string>> = {
  [MMC.keyword]: "Ⓜ",
  [LMC.keyword]: "Ⓛ",
  [RFS.keyword]: "",
};

const DEFAULT_HEIGHT = 120;

type Pending = "characteristic" | "value" | "material" | "datums" | "height" | "insertion";

interface ToleranceState {
  symbol: string;
  characteristic: string;
  value: string;
  material: string;
  datums: string[];
  height: number;
  pending: Pending;
}

const PROMPTS: Readonly<Record<Pending, string>> = {
  characteristic: "Escriba la característica geométrica",
  value: "Escriba el valor de la tolerancia",
  material: "Precise la condición de material",
  datums: "Escriba las referencias (datums), separadas por coma",
  height: "Precise la altura del texto",
  insertion: "Precise la ubicación del marco",
};

function toleranceStep(state: ToleranceState, context: CadCommandContext): CadCommandStep<ToleranceState> {
  return {
    state,
    prompt: {
      message: PROMPTS[state.pending],
      options: state.pending === "material" ? [MMC, LMC, RFS] : [],
      ...(state.pending === "characteristic"
        ? { defaultValue: "posicion, paralelismo, perpendicularidad…" }
        : {}),
      ...(state.pending === "height" ? { defaultValue: String(state.height) } : {}),
    },
    accepts:
      state.pending === "insertion"
        ? CAD_ACCEPT_POINT
        : state.pending === "material"
          ? CAD_ACCEPT_KEYWORD
          : state.pending === "height"
            ? CAD_ACCEPT_DISTANCE
            : CAD_ACCEPT_TEXT,
    preview: context.cursor && state.pending === "insertion" ? [{ points: [context.cursor] }] : [],
  };
}

/** Las casillas del marco, de izquierda a derecha. */
export function cadToleranceCells(state: {
  symbol: string;
  value: string;
  material: string;
  datums: readonly string[];
}): string[] {
  return [state.symbol, `${state.value}${state.material}`, ...state.datums];
}

interface FrameCell {
  text: string;
  x: number;
  width: number;
}

/**
 * Reparte las casillas midiendo su texto.
 *
 * Se mide con `measureCadMText`, que es la misma función con la que se maqueta
 * el MTEXT: si el marco se dimensionara con una regla propia, el texto se saldría
 * de su casilla en cuanto una referencia tuviera dos letras.
 */
export function cadToleranceLayout(
  cells: readonly string[],
  height: number,
): { cells: FrameCell[]; width: number; boxHeight: number } {
  const padding = height * 0.45;
  // Ancho mínimo de casilla: un cuadrado. Un datum de una letra en una casilla
  // estrecha como un palillo no se lee como casilla.
  const minimum = height + padding * 2;
  let x = 0;
  const laid = cells.map((text) => {
    const width = Math.max(minimum, measureCadMText(text, height) + padding * 2);
    const cell = { text, x, width };
    x += width;
    return cell;
  });
  return { cells: laid, width: x, boxHeight: height + padding * 2 };
}

function toleranceFinish(
  state: ToleranceState,
  insertion: CadPoint2,
  context: CadCommandContext,
): CadCommandStep<ToleranceState> {
  const cells = cadToleranceCells(state);
  const layout = cadToleranceLayout(cells, state.height);
  const frameId = context.newEntityId();
  // Todas las piezas del marco comparten esta marca. No las convierte en un
  // objeto —el esquema no tiene grupos— pero deja escrito de qué marco es cada
  // una, que es lo que hará falta para recomponerlas.
  const metadata = { toleranceFrame: frameId, toleranceCharacteristic: state.characteristic };
  const top = insertion.y;
  const bottom = insertion.y - layout.boxHeight;
  const commands: CadEntityCommand[] = [];

  const frame: CadNativeEntity = {
    id: frameId,
    type: "polyline",
    vertices: [
      flat({ x: insertion.x, y: top }),
      flat({ x: insertion.x + layout.width, y: top }),
      flat({ x: insertion.x + layout.width, y: bottom }),
      flat({ x: insertion.x, y: bottom }),
    ],
    closed: true,
    layer: context.activeLayer,
    context: { metadata },
  };
  commands.push({ type: "insert", entity: frame });

  for (const cell of layout.cells.slice(1)) {
    const x = insertion.x + cell.x;
    commands.push({
      type: "insert",
      entity: {
        id: context.newEntityId(),
        type: "line",
        start: flat({ x, y: top }),
        end: flat({ x, y: bottom }),
        layer: context.activeLayer,
        context: { metadata },
      },
    });
  }

  for (const cell of layout.cells) {
    commands.push({
      type: "insert",
      entity: {
        id: context.newEntityId(),
        type: "mtext",
        insertion: flat({ x: insertion.x + cell.x + cell.width / 2, y: (top + bottom) / 2 }),
        text: cell.text,
        height: state.height,
        width: cell.width,
        alignment: "middle-center",
        layer: context.activeLayer,
        context: { metadata },
      },
    });
  }

  return cadCommandWrites(state, commands, "TOLERANCE");
}

const toleranceCommand: CadCommandDescriptor<ToleranceState> = {
  name: "TOLERANCE",
  aliases: ["TOL"],
  kind: "annotate",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) =>
    toleranceStep(
      {
        symbol: "",
        characteristic: "",
        value: "",
        material: "",
        datums: [],
        height: DEFAULT_HEIGHT,
        pending: "characteristic",
      },
      context,
    ),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);

    if (input.kind === "keyword" && state.pending === "material") {
      const material = MATERIAL[input.keyword];
      if (material === undefined) return toleranceStep(state, context);
      return toleranceStep({ ...state, material, pending: "datums" }, context);
    }

    if (input.kind === "text") {
      if (state.pending === "characteristic") {
        const name = input.value.trim().toLowerCase().replace(/\s+/g, "-");
        const symbol = CHARACTERISTICS[name];
        if (!symbol)
          return cadCommandRefused(
            state,
            `«${input.value.trim()}» no es una característica geométrica. Válidas: ` +
              `${[...new Set(Object.keys(CHARACTERISTICS))].join(", ")}.`,
          );
        return toleranceStep({ ...state, symbol, characteristic: name, pending: "value" }, context);
      }
      if (state.pending === "value") {
        const value = input.value.trim().slice(0, 64);
        if (!value)
          return cadCommandRefused(state, "Un marco de control necesita un valor de tolerancia.");
        return toleranceStep({ ...state, value, pending: "material" }, context);
      }
      if (state.pending === "datums") {
        const datums = input.value
          .split(",")
          .map((datum) => datum.trim().toUpperCase())
          .filter(Boolean)
          .slice(0, 3);
        return toleranceStep({ ...state, datums, pending: "height" }, context);
      }
      return toleranceStep(state, context);
    }

    if (input.kind === "distance" && state.pending === "height") {
      const height = Math.abs(input.value);
      return toleranceStep(
        { ...state, height: height > 1e-9 ? height : state.height, pending: "insertion" },
        context,
      );
    }

    if (input.kind === "point" && state.pending === "insertion")
      return toleranceFinish(state, input.point, context);

    if (input.kind === "enter") {
      // Enter salta los pasos opcionales: sin datums y con la altura propuesta.
      if (state.pending === "material") return toleranceStep({ ...state, pending: "datums" }, context);
      if (state.pending === "datums") return toleranceStep({ ...state, pending: "height" }, context);
      if (state.pending === "height") return toleranceStep({ ...state, pending: "insertion" }, context);
      return cadCommandCancelled(state);
    }

    return toleranceStep(state, context);
  },
};

export const CAD_TOLERANCE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(toleranceCommand),
];
