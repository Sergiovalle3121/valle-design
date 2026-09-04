/**
 * TCOUNT y TXT2MTXT: las dos Express Tools que trabajan sobre el TEXTO ya
 * escrito en el plano.
 *
 * Las dos resuelven el mismo trabajo aburrido y diario —numerar cuarenta
 * rótulos, o recoger en un solo párrafo la nota que llegó partida en seis
 * TEXT de un DXF ajeno— y las dos dependen de la misma decisión, que es la
 * única cosa interesante que hay aquí: **cuál es el orden de lectura de un
 * montón de textos sueltos**.
 *
 * La respuesta es la de un plano, no la de un array: de arriba abajo y, a la
 * misma altura, de izquierda a derecha. Por eso el orden por Y es DESCENDENTE
 * —quien numera un cuadro de acabados espera el 1 arriba— y por eso los
 * empates se rompen siempre, hasta por el identificador si hace falta: un
 * orden que depende de en qué orden llegaron las entidades da una numeración
 * distinta cada vez que se abre el dibujo, y eso no es numerar.
 *
 * Viven aparte de `express-tools.ts` por el trinquete de tamaño y porque son
 * otro tema: aquello es geometría y tabla de capas, esto es documento escrito.
 */
import type { CadEntity } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import {
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
import {
  documentResult,
  entityName,
  nothing,
  num,
  plural,
  say,
} from "./express-tools-support";

type CadTextEntity = Extract<CadNativeEntity, { type: "text" }>;
type CadMTextEntity = Extract<CadNativeEntity, { type: "mtext" }>;

/** Dónde se ancla un rótulo, sea TEXT (x,y) o MTEXT (inserción). */
function anchorOf(entity: CadEntity): { x: number; y: number } | null {
  if (entity.type === "text") return { x: entity.x, y: entity.y };
  if (entity.type === "mtext") return { x: entity.insertion.x, y: entity.insertion.y };
  return null;
}

/**
 * El orden de lectura del plano: arriba primero, y a la misma altura, de
 * izquierda a derecha. El identificador cierra el desempate para que dos
 * rótulos exactamente superpuestos ordenen igual en cada pasada.
 */
function readingOrder(
  a: { id: string; x: number; y: number },
  b: { id: string; x: number; y: number },
): number {
  return b.y - a.y || a.x - b.x || a.id.localeCompare(b.id);
}

// ---------------------------------------------------------------------------
// TCOUNT — numerar los textos designados
// ---------------------------------------------------------------------------

const BY_X = { keyword: "X", shortcut: "X" } as const;
const BY_Y = { keyword: "Y", shortcut: "Y" } as const;
const BY_PICK = { keyword: "Designación", shortcut: "D" } as const;

const PREPEND = { keyword: "Anteponer", shortcut: "A" } as const;
const APPEND = { keyword: "Añadir", shortcut: "Ñ" } as const;
const REPLACE = { keyword: "Sustituir", shortcut: "S" } as const;

type TcountOrder = "x" | "y" | "pick";
type TcountPlacement = "prepend" | "append" | "replace";

interface TcountState {
  /** En orden de DESIGNACIÓN: es uno de los tres órdenes que se ofrecen. */
  targets: readonly string[];
  phase: "select" | "order" | "range" | "affixes" | "placement";
  order: TcountOrder;
  start: number;
  increment: number;
  prefix: string;
  suffix: string;
}

const TCOUNT_START: TcountState = {
  targets: [],
  phase: "select",
  order: "pick",
  start: 1,
  increment: 1,
  prefix: "",
  suffix: "",
};

function tcountStep(state: TcountState, note?: string): CadCommandStep<TcountState> {
  const head = note ? `${note} ` : "";
  if (state.phase === "select")
    return {
      state,
      prompt: {
        message: `${head}Designe los textos a numerar (${state.targets.length}; Enter para terminar)`,
        options: [],
      },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  if (state.phase === "order")
    return {
      state,
      prompt: {
        message: `${head}Orden de numeración`,
        options: [BY_X, BY_Y, BY_PICK],
        defaultOption: BY_PICK.keyword,
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  if (state.phase === "range")
    return {
      state,
      prompt: {
        message: `${head}Número inicial e incremento, separados por coma`,
        options: [],
        defaultValue: `${state.start},${state.increment}`,
      },
      accepts: CAD_ACCEPT_TEXT,
    };
  if (state.phase === "affixes")
    return {
      state,
      prompt: {
        message: `${head}Prefijo y sufijo del número, separados por coma (Enter: ninguno)`,
        options: [],
        defaultValue: `${state.prefix},${state.suffix}`,
      },
      accepts: CAD_ACCEPT_TEXT,
    };
  return {
    state,
    prompt: {
      message: `${head}Dónde va el número`,
      options: [PREPEND, APPEND, REPLACE],
      defaultOption: PREPEND.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

/** `1,2` → inicio 1, incremento 2. Un incremento nulo no numera: numeraría. */
function parseRange(value: string): { start: number; increment: number } | string {
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length !== 2) return "Escriba el número inicial y el incremento separados por una coma, por ejemplo 1,1.";
  const [start, increment] = parts.map(Number);
  if (!Number.isInteger(start) || !Number.isInteger(increment))
    return "El número inicial y el incremento tienen que ser enteros.";
  if (increment === 0) return "Un incremento de 0 daría el mismo número a todos los textos.";
  return { start, increment };
}

function tcountFinish(
  state: TcountState,
  placement: TcountPlacement,
  context: CadCommandContext,
): CadCommandStep<TcountState> {
  const rows: { id: string; entity: CadTextEntity | CadMTextEntity; x: number; y: number; pick: number }[] = [];
  const refused: string[] = [];
  state.targets.forEach((id, pick) => {
    const entity = context.entity?.(id);
    if (!entity) {
      refused.push(`${id}: ya no existe`);
      return;
    }
    const anchor = anchorOf(entity);
    if (!anchor || (entity.type !== "text" && entity.type !== "mtext")) {
      refused.push(`${id}: TCOUNT numera texto, y ${entityName(entity.type)} no lo es`);
      return;
    }
    rows.push({ id, entity, x: anchor.x, y: anchor.y, pick });
  });

  if (rows.length === 0)
    return say(
      state,
      refused.length > 0
        ? `TCOUNT no numeró nada. ${refused.join("; ")}.`
        : "TCOUNT no tiene ningún texto designado; no se hizo nada.",
    );

  const sorted = [...rows].sort((a, b) => {
    if (state.order === "pick") return a.pick - b.pick;
    if (state.order === "x") return a.x - b.x || b.y - a.y || a.id.localeCompare(b.id);
    return readingOrder(a, b);
  });

  const commands: CadEntityCommand[] = sorted.map((row, index) => {
    const value = state.start + index * state.increment;
    const tag = `${state.prefix}${value}${state.suffix}`;
    const previous = row.entity.text;
    const text =
      placement === "replace" ? tag : placement === "append" ? `${previous}${tag}` : `${tag}${previous}`;
    return { type: "properties", entityId: row.id, patch: { text } };
  });

  const last = state.start + (sorted.length - 1) * state.increment;
  const orderName =
    state.order === "pick"
      ? "por orden de designación"
      : state.order === "x"
        ? "por X, de izquierda a derecha"
        : "por Y, de arriba abajo";
  const placementName =
    placement === "replace" ? "sustituyendo" : placement === "append" ? "añadiendo al final" : "anteponiendo";
  const label = `TCOUNT: ${plural(sorted.length, "texto numerado", "textos numerados")} de ${num(state.start)} a ${num(last)} (incremento ${num(state.increment)}), ${orderName}, ${placementName}`;
  const notice = refused.length > 0 ? `TCOUNT dejó fuera: ${refused.join("; ")}.` : undefined;
  return documentResult(state, commands, label, notice);
}

/**
 * TCOUNT: numera los textos designados.
 *
 * Las tres formas de colocar el número son las de AutoCAD y ninguna es
 * cosmética: `Anteponer` es lo que hace una leyenda («1 SALA»), `Añadir` lo
 * que hace un despiece («VIGA V-1» → «VIGA V-1 3»), y `Sustituir` es lo que
 * convierte una columna de textos provisionales en una numeración limpia. El
 * prefijo y el sufijo envuelven SÓLO al número, así que `(`,`)` da `(1)` y no
 * hace falta un formato propio.
 */
const tcountCommand: CadCommandDescriptor<TcountState> = {
  name: "TCOUNT",
  aliases: ["NUMTEXTO"],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => tcountStep({ ...TCOUNT_START, targets: [...context.selection] }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return nothing(state);

    if (state.phase === "select") {
      if (input.kind === "entityPick")
        return tcountStep({ ...state, targets: [...new Set([...state.targets, input.entityId])] });
      if (input.kind === "selection")
        return tcountStep({ ...state, targets: [...new Set([...state.targets, ...input.entityIds])] });
      if (input.kind !== "enter") return tcountStep(state);
      if (state.targets.length === 0)
        return say(state, "TCOUNT no tiene ningún texto designado; no se hizo nada.");
      return tcountStep({ ...state, phase: "order" });
    }

    if (state.phase === "order") {
      const keyword = input.kind === "keyword" ? input.keyword : BY_PICK.keyword;
      const order: TcountOrder =
        keyword === BY_X.keyword ? "x" : keyword === BY_Y.keyword ? "y" : "pick";
      return tcountStep({ ...state, phase: "range", order });
    }

    if (state.phase === "range") {
      if (input.kind === "enter") return tcountStep({ ...state, phase: "affixes" });
      if (input.kind !== "text") return tcountStep(state);
      const parsed = parseRange(input.value);
      if (typeof parsed === "string") return tcountStep(state, parsed);
      return tcountStep({ ...state, phase: "affixes", start: parsed.start, increment: parsed.increment });
    }

    if (state.phase === "affixes") {
      if (input.kind === "enter") return tcountStep({ ...state, phase: "placement" });
      if (input.kind !== "text") return tcountStep(state);
      const [prefix = "", suffix = ""] = input.value.split(",");
      return tcountStep({ ...state, phase: "placement", prefix, suffix });
    }

    const keyword = input.kind === "keyword" ? input.keyword : PREPEND.keyword;
    const placement: TcountPlacement =
      keyword === REPLACE.keyword ? "replace" : keyword === APPEND.keyword ? "append" : "prepend";
    return tcountFinish(state, placement, context);
  },
};

// ---------------------------------------------------------------------------
// TXT2MTXT — fundir varios TEXT en un solo MTEXT
// ---------------------------------------------------------------------------

interface Txt2MtextState {
  targets: readonly string[];
}

function txt2mtextStep(state: Txt2MtextState, note?: string): CadCommandStep<Txt2MtextState> {
  return {
    state,
    prompt: {
      message: `${note ? `${note} ` : ""}Designe los TEXT a fundir en un MTEXT (${state.targets.length}; Enter para terminar)`,
      options: [],
    },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
  };
}

/**
 * TXT2MTXT: funde los TEXT designados en un MTEXT y borra los originales EN EL
 * MISMO LOTE.
 *
 * Lo del mismo lote no es una elección de estilo: si el MTEXT naciera en una
 * transacción y los TEXT murieran en otra, un deshacer dejaría el párrafo y
 * los seis textos originales encima, exactamente superpuestos e ilegibles.
 *
 * ## De quién hereda el párrafo
 *
 * Del PRIMERO en orden de lectura —el de arriba a la izquierda—, que es el que
 * el usuario mira cuando ejecuta la orden. Altura, estilo, rotación y capa
 * salen de él, y lo que los demás traían distinto se DICE en el aviso en vez
 * de perderse callando. La pérdida que más duele es el color explícito: un
 * MTEXT no tiene campo de color propio en este esquema, así que un TEXT rojo
 * entra al párrafo con el color de la capa.
 *
 * ## Lo que NO hace todavía
 *
 * No reajusta líneas: el MTEXT nace SIN ancho de columna, así que conserva
 * exactamente los saltos que tenían los TEXT. Poner un ancho exigiría medir el
 * avance de cada glifo, y el motor no tiene métricas de fuente: inventar un
 * ancho por un promedio dejaría párrafos partidos donde no toca.
 */
const txt2mtextCommand: CadCommandDescriptor<Txt2MtextState> = {
  name: "TXT2MTXT",
  aliases: ["TEXTOAMTEXTO"],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => txt2mtextStep({ targets: [...context.selection] }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return nothing(state);
    if (input.kind === "entityPick")
      return txt2mtextStep({ targets: [...new Set([...state.targets, input.entityId])] });
    if (input.kind === "selection")
      return txt2mtextStep({ targets: [...new Set([...state.targets, ...input.entityIds])] });
    if (input.kind !== "enter") return txt2mtextStep(state);

    const rows: { id: string; entity: CadTextEntity; x: number; y: number }[] = [];
    const refused: string[] = [];
    for (const id of state.targets) {
      const entity = context.entity?.(id);
      if (!entity) {
        refused.push(`${id}: ya no existe`);
        continue;
      }
      if (entity.type !== "text") {
        refused.push(`${id}: TXT2MTXT funde TEXT, y ${entityName(entity.type)} no lo es`);
        continue;
      }
      rows.push({ id, entity, x: entity.x, y: entity.y });
    }

    if (rows.length < 2)
      return say(
        state,
        `TXT2MTXT necesita al menos dos TEXT y ${rows.length === 1 ? "sólo hay uno" : "no hay ninguno"} entre lo designado.` +
          (refused.length > 0 ? ` ${refused.join("; ")}.` : ""),
      );

    const sorted = [...rows].sort(readingOrder);
    const first = sorted[0].entity;
    const height = first.height;
    const rotation = first.rotation;
    const style = first.style;

    // El párrafo nace ANCLADO arriba a la izquierda del conjunto: con
    // `top-left`, la inserción y esa esquina son el mismo punto, así que el
    // MTEXT ocupa el sitio que ocupaban los TEXT y no se desplaza media línea.
    const insertion = {
      x: Math.min(...sorted.map((row) => row.x)),
      y: Math.max(...sorted.map((row) => row.y)),
      z: 0,
    };

    const differing = {
      height: sorted.filter((row) => (row.entity.height ?? height) !== height).length,
      style: sorted.filter((row) => (row.entity.style ?? style) !== style).length,
      rotation: sorted.filter((row) => (row.entity.rotation ?? rotation) !== rotation).length,
      layer: sorted.filter((row) => row.entity.layer !== first.layer).length,
      color: sorted.filter((row) => !!row.entity.color).length,
    };

    const mtext: CadNativeEntity = {
      id: context.newEntityId(),
      type: "mtext",
      insertion,
      text: sorted.map((row) => row.entity.text).join("\n"),
      alignment: "top-left",
      paragraphAlignment: "left",
      layer: first.layer,
      ...(height === undefined ? {} : { height }),
      ...(rotation === undefined ? {} : { rotation }),
      ...(style === undefined ? {} : { style }),
    };

    const commands: CadEntityCommand[] = [
      { type: "insert", entity: mtext },
      ...sorted.map((row): CadEntityCommand => ({ type: "delete", entityId: row.id })),
    ];

    const losses: string[] = [];
    if (differing.height > 0)
      losses.push(`${differing.height} con otra altura, igualadas a ${num(height ?? 0)}`);
    if (differing.style > 0) losses.push(`${differing.style} con otro estilo, igualados a "${style ?? "Standard"}"`);
    if (differing.rotation > 0) losses.push(`${differing.rotation} con otra rotación`);
    if (differing.layer > 0) losses.push(`${differing.layer} de otra capa, traídos a "${first.layer}"`);
    if (differing.color > 0)
      losses.push(
        `${differing.color} con color explícito: un MTEXT no lo guarda y entran PorCapa`,
      );
    if (refused.length > 0) losses.push(`sin fundir: ${refused.join("; ")}`);

    const label = `TXT2MTXT: ${plural(sorted.length, "TEXT fundido", "TEXT fundidos")} en un MTEXT de ${plural(sorted.length, "línea", "líneas")}`;
    const notice =
      losses.length > 0
        ? `TXT2MTXT heredó del primer texto en orden de lectura; ${losses.join("; ")}. El MTEXT nace sin ancho de columna: conserva los saltos de línea originales.`
        : undefined;
    return documentResult(state, commands, label, notice);
  },
};

export const CAD_EXPRESS_TEXT_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(tcountCommand),
  asCadCommand(txt2mtextCommand),
];
