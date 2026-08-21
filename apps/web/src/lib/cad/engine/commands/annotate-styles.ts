/**
 * STYLE, DIMSTYLE, MLEADERSTYLE y TABLESTYLE.
 *
 * El documento tiene la sección `styles` con sus cinco familias y la ola 1 dejó
 * el gestor gráfico en `components/cad/palettes/`. Faltaba poder teclearlos: en
 * un CAD, `D` abre los estilos de cota y `ST` los de texto, y esa memoria
 * muscular es la que hace que definir un estilo no interrumpa el dibujo.
 *
 * ## Una sola máquina para las cuatro órdenes
 *
 * Las cuatro hacen lo mismo —pedir un nombre y luego los campos de la familia—
 * y sólo cambian en QUÉ campos. Así que hay una máquina de estados y una tabla:
 * añadir un campo es una línea, y las cuatro órdenes se comportan igual sin que
 * nadie tenga que acordarse de replicar el arreglo en las otras tres.
 *
 * ## Por qué no se puede borrar un estilo en uso
 *
 * Las entidades guardan el NOMBRE del estilo (`mtext.style`, `dimension.style`,
 * `mleader.style`), no un identificador. Borrar el estilo que usan las dejaría
 * apuntando a algo que no existe y el dibujo cambiaría de aspecto sin que nadie
 * lo hubiera pedido. La orden cuenta las referencias y se NIEGA diciendo cuántas
 * hay: es la clase de negativa que ahorra media hora de buscar por qué las cotas
 * cambiaron de tamaño solas.
 *
 * Renombrar no se ofrece, por lo mismo y por más: reasignar las entidades que lo
 * usaban es una migración sobre `entities`, y hacerla a medias —cambiar el
 * nombre y no las referencias— es peor que no ofrecerla.
 */
import type { CadStyleFamilyName } from "../../entity-commands";
import {
  cadCompareDimensionStyles,
  cadDimensionStyleBake,
  resolveCadDimensionStyle,
} from "../../dimension-style";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import { cadCommandCancelled, cadCommandRefused, cadCommandWrites } from "./annotate-support";

type StyleValue = string | number | boolean;

interface StyleField {
  key: string;
  prompt: string;
  kind: "text" | "number" | "boolean";
  fallback: StyleValue;
  /** Mínimo para los numéricos: una altura de texto de cero no se dibuja. */
  min?: number;
  /** Redondea a entero. La precisión de una cota son dígitos, no milímetros. */
  integer?: boolean;
  /**
   * Vocabulario CERRADO para un campo de texto: `flecha` o `unidad` con un
   * valor inventado no fallan al guardar — fallan al DIBUJAR, semanas después
   * y sin decir por qué. Aquí la negativa llega en el momento de teclear.
   */
  options?: readonly string[];
}

interface StyleCommandSpec {
  name: string;
  aliases: readonly string[];
  family: CadStyleFamilyName;
  label: string;
  fields: readonly StyleField[];
  /** Tipo de entidad que lo referencia por nombre. Sin él, nada lo bloquea. */
  referencedBy?: string;
}

const DELETE_OPTION = { keyword: "Suprimir", shortcut: "S" } as const;
const APPLY_OPTION = { keyword: "Aplicar", shortcut: "A" } as const;
const COMPARE_OPTION = { keyword: "Comparar", shortcut: "C" } as const;
const YES = { keyword: "Sí", shortcut: "S" } as const;
const NO = { keyword: "No", shortcut: "N" } as const;

const STYLE_COMMANDS: readonly StyleCommandSpec[] = [
  {
    name: "STYLE",
    aliases: ["ST"],
    family: "text",
    label: "texto",
    referencedBy: "mtext",
    fields: [
      { key: "fontFamily", prompt: "Precise la fuente", kind: "text", fallback: "Arial" },
      { key: "height", prompt: "Precise la altura", kind: "number", fallback: 120, min: 1e-6 },
    ],
  },
  {
    name: "DIMSTYLE",
    aliases: ["D", "DST", "DDIM"],
    family: "dimension",
    label: "cota",
    referencedBy: "dimension",
    // El diálogo pide el subconjunto que se teclea a diario; el núcleo
    // COMPLETO de ~30 DIMVARs (dimension-style.ts) es editable desde el
    // gestor de estilos y viaja entero por la tabla DIMSTYLE del DXF.
    fields: [
      { key: "textStyle", prompt: "Precise el estilo de texto (DIMTXSTY)", kind: "text", fallback: "Standard" },
      { key: "textHeight", prompt: "Precise la altura de texto (DIMTXT)", kind: "number", fallback: 120, min: 1e-6 },
      { key: "arrowSize", prompt: "Precise el tamaño de flecha (DIMASZ)", kind: "number", fallback: 180, min: 1e-6 },
      {
        key: "arrowhead",
        prompt: "Precise el terminador (DIMBLK)",
        kind: "text",
        fallback: "closed-filled",
        options: ["closed-filled", "open", "architectural-tick", "dot"],
      },
      {
        key: "precision",
        prompt: "Precise el número de decimales (DIMDEC)",
        kind: "number",
        fallback: 2,
        min: 0,
        integer: true,
      },
      {
        key: "units",
        prompt: "Precise la unidad de la medida",
        kind: "text",
        fallback: "mm",
        options: ["mm", "cm", "m", "in", "ft"],
      },
      {
        key: "overallScale",
        prompt: "Precise la escala global (DIMSCALE)",
        kind: "number",
        fallback: 1,
        min: 1e-6,
      },
    ],
  },
  {
    name: "MLEADERSTYLE",
    aliases: ["MLS"],
    family: "mleader",
    label: "directriz",
    referencedBy: "mleader",
    fields: [
      { key: "textStyle", prompt: "Precise el estilo de texto", kind: "text", fallback: "Standard" },
      { key: "arrowSize", prompt: "Precise el tamaño de flecha", kind: "number", fallback: 180, min: 1e-6 },
      { key: "doglegLength", prompt: "Precise la longitud del codo", kind: "number", fallback: 600, min: 0 },
      { key: "landing", prompt: "¿Lleva codo de aterrizaje?", kind: "boolean", fallback: true },
    ],
  },
  {
    name: "TABLESTYLE",
    aliases: ["TS"],
    family: "table",
    label: "tabla",
    // La entidad TABLE del esquema 4 no lleva todavía campo `style`, así que no
    // hay nada que contar y borrar un estilo de tabla nunca deja huérfano a
    // nadie. Es un cero HONESTO —no hay referencias— y no un «no lo sé»: el día
    // que la entidad gane el campo, basta añadirlo aquí.
    fields: [
      { key: "textStyle", prompt: "Precise el estilo de texto", kind: "text", fallback: "Standard" },
      { key: "rowHeight", prompt: "Precise la altura de fila", kind: "number", fallback: 200, min: 1e-6 },
    ],
  },
];

interface StyleState {
  spec: StyleCommandSpec;
  name: string;
  values: Record<string, StyleValue>;
  /** Índice del campo que se está pidiendo; `-1` mientras se pide el nombre. */
  field: number;
  deleting: boolean;
  /** DIMSTYLE → Aplicar: re-hornear las cotas existentes del estilo. */
  applying?: boolean;
  /** DIMSTYLE → Comparar: primer nombre ya capturado, se pide el segundo. */
  comparingWith?: string | null;
}

function fieldOf(state: StyleState): StyleField | undefined {
  return state.spec.fields[state.field];
}

function styleStep(state: StyleState): CadCommandStep<StyleState> {
  if (state.field < 0) {
    const message = state.comparingWith
      ? `Escriba el SEGUNDO estilo a comparar con «${state.comparingWith}»`
      : state.applying
        ? `Escriba el estilo de ${state.spec.label} a APLICAR a sus cotas`
        : `Escriba el nombre del estilo de ${state.spec.label}`;
    return {
      state,
      prompt: {
        message,
        options:
          state.spec.family === "dimension" &&
          !state.applying &&
          state.comparingWith === undefined
            ? [DELETE_OPTION, APPLY_OPTION, COMPARE_OPTION]
            : [DELETE_OPTION],
      },
      accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD,
    };
  }
  const field = fieldOf(state)!;
  return {
    state,
    prompt: {
      message: field.prompt,
      options: field.kind === "boolean" ? [YES, NO] : [],
      defaultValue: String(state.values[field.key] ?? field.fallback),
    },
    accepts:
      field.kind === "boolean"
        ? CAD_ACCEPT_KEYWORD
        : field.kind === "number"
          ? CAD_ACCEPT_DISTANCE
          : CAD_ACCEPT_TEXT,
  };
}

/** Cuántas entidades del dibujo apuntan a este estilo por su nombre. */
function styleUsage(state: StyleState, context: CadCommandContext): number {
  const type = state.spec.referencedBy;
  if (!type || !context.entity) return 0;
  let count = 0;
  for (const entityId of context.entityIds) {
    const entity = context.entity(entityId);
    if (!entity || entity.type !== type) continue;
    if ((entity as { style?: string }).style === state.name) count += 1;
  }
  return count;
}

/** Avanza al campo siguiente, o remata escribiendo el estilo entero. */
function advance(state: StyleState): CadCommandStep<StyleState> {
  const next = state.field + 1;
  if (next < state.spec.fields.length) return styleStep({ ...state, field: next });
  // Los campos que no se tocaron viajan con su valor por defecto: un estilo a
  // medias, con la fuente puesta y la altura ausente, obligaría a cada
  // consumidor a inventarse la que falta y cada uno inventaría la suya.
  const values: Record<string, StyleValue> = {};
  for (const field of state.spec.fields) values[field.key] = state.values[field.key] ?? field.fallback;
  return cadCommandWrites(
    state,
    [{ type: "style", op: "upsert", family: state.spec.family, name: state.name, values }],
    state.spec.name,
  );
}

function styleDescriptor(spec: StyleCommandSpec): CadCommandDescriptor<StyleState> {
  const empty: StyleState = {
    spec,
    name: "",
    values: {},
    field: -1,
    deleting: false,
    comparingWith: undefined,
  };
  return {
    name: spec.name,
    aliases: spec.aliases,
    kind: "manage",
    transparent: false,
    selection: "none",
    repeatable: true,
    mutates: true,
    cursor: "none",
    begin: () => styleStep(empty),
    step: (state, input, context) => {
      if (input.kind === "cancel") return cadCommandCancelled(state);

      if (input.kind === "keyword") {
        if (state.field < 0) {
          if (input.keyword === DELETE_OPTION.keyword)
            return styleStep({ ...state, deleting: true });
          if (spec.family === "dimension" && input.keyword === APPLY_OPTION.keyword)
            return styleStep({ ...state, applying: true });
          if (spec.family === "dimension" && input.keyword === COMPARE_OPTION.keyword)
            return styleStep({ ...state, comparingWith: null });
        }
        const field = fieldOf(state);
        if (field?.kind === "boolean" && (input.keyword === YES.keyword || input.keyword === NO.keyword))
          return advance({
            ...state,
            values: { ...state.values, [field.key]: input.keyword === YES.keyword },
          });
        return styleStep(state);
      }

      if (input.kind === "text") {
        if (state.field < 0) {
          const name = input.value.trim().slice(0, 128);
          if (!name) return cadCommandRefused(state, "Un estilo necesita un nombre no vacío.");

          // Comparar: dos nombres → diferencias efectivas, campo a campo.
          if (state.comparingWith === null) return styleStep({ ...state, comparingWith: name });
          if (state.comparingWith) {
            const differences = cadCompareDimensionStyles(
              context.document?.().styles,
              state.comparingWith,
              name,
            );
            return cadCommandRefused(
              state,
              differences.length === 0
                ? `«${state.comparingWith}» y «${name}» son efectivamente idénticos.`
                : `«${state.comparingWith}» → «${name}»: ${differences.join("; ")}`,
            );
          }

          // Aplicar: re-hornea las cotas existentes del estilo — así una norma
          // alcanza a un plano ya dibujado, no sólo a las cotas por nacer.
          if (state.applying) {
            const definition = resolveCadDimensionStyle(context.document?.().styles, name);
            const baked = cadDimensionStyleBake(definition);
            const commands = [];
            for (const entityId of context.entityIds) {
              const entity = context.entity?.(entityId);
              if (!entity || entity.type !== "dimension") continue;
              if ((entity as { style?: string }).style !== name) continue;
              commands.push({
                type: "replace" as const,
                entityId,
                entity: { ...entity, ...baked } as typeof entity,
              });
            }
            if (commands.length === 0)
              return cadCommandRefused(
                state,
                `Ninguna cota usa el estilo «${name}»: nada que aplicar.`,
              );
            return cadCommandWrites(
              { ...state, name },
              commands,
              `${spec.name} aplicar «${name}» (${commands.length} cota(s))`,
            );
          }

          const named = { ...state, name };
          if (!state.deleting) return advance({ ...named, field: -1 });
          const usage = styleUsage(named, context);
          if (usage > 0)
            return cadCommandRefused(
              named,
              `No se puede borrar el estilo de ${spec.label} «${name}»: lo usan ${usage} objeto(s). ` +
                "Cámbiales el estilo primero.",
            );
          return cadCommandWrites(
            named,
            [{ type: "style", op: "delete", family: spec.family, name }],
            `${spec.name} borrar`,
          );
        }
        const field = fieldOf(state)!;
        if (field.kind !== "text") return styleStep(state);
        const value = input.value.trim().slice(0, 128);
        if (value && field.options && !field.options.includes(value))
          return cadCommandRefused(
            state,
            `${field.prompt}: «${value}» no está en el vocabulario (${field.options.join(", ")}).`,
          );
        return advance({ ...state, values: { ...state.values, [field.key]: value || field.fallback } });
      }

      if (input.kind === "distance") {
        const field = fieldOf(state);
        if (field?.kind !== "number") return styleStep(state);
        const raw = field.integer ? Math.round(input.value) : input.value;
        const minimum = field.min ?? 0;
        if (!(raw >= minimum))
          return cadCommandRefused(state, `${field.prompt}: ${raw} no llega al mínimo (${minimum}).`);
        return advance({ ...state, values: { ...state.values, [field.key]: raw } });
      }

      // Enter acepta el valor propuesto. En el paso del nombre no hay nada que
      // proponer: sin nombre no hay estilo, así que se cancela.
      if (input.kind === "enter") return state.field < 0 ? cadCommandCancelled(state) : advance(state);

      return styleStep(state);
    },
  };
}

export const CAD_ANNOTATE_STYLE_COMMANDS: readonly CadAnyCommandDescriptor[] =
  STYLE_COMMANDS.map((spec) => asCadCommand(styleDescriptor(spec)));

export const __testables = { STYLE_COMMANDS };
