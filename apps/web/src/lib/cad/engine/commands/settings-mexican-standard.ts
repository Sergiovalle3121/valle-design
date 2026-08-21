/**
 * `NORMAMX`: aplicar la norma de dibujo mexicana a un dibujo que ya existe.
 *
 * ## Por qué hace falta si las plantillas ya la traen
 *
 * Porque la plantilla sólo alcanza a los documentos que nacen aquí. Los otros
 * dos casos son la mayoría del trabajo real de un despacho:
 *
 * - **El DXF ajeno.** Llega el archivo del estructurista con sus capas en
 *   inglés y sin grosores. El arquitecto quiere seguir dibujando con las suyas.
 * - **El documento anterior.** El que se creó con un lienzo en blanco, o antes
 *   de que existieran las plantillas.
 *
 * Sin esta orden, la norma sería una propiedad de los documentos nuevos y no
 * del producto.
 *
 * ## Por qué NO sobrescribe lo que ya existe
 *
 * Una capa que ya está en el dibujo se deja EXACTAMENTE como está, aunque su
 * color no coincida con el de la norma. El arquitecto puede haber cambiado el
 * grosor de `MURO` a conciencia, y una orden que se lo pisara sería una orden
 * que nadie vuelve a ejecutar. Se AÑADE lo que falta y se dice cuánto.
 *
 * Lo mismo con los estilos: si el dibujo ya tiene un `COTA 1:50`, se respeta.
 *
 * ## Por qué se niega cuando no puede mirar
 *
 * Si el anfitrión no expone la tabla de capas, la orden se niega diciéndolo en
 * vez de añadir las treinta y dos a ciegas. Añadir una capa que ya existe con
 * otro color cambiaría el aspecto del plano sin que nadie lo hubiera pedido, y
 * es el tipo de sorpresa que se descubre al imprimir.
 */
import type { CadEntityCommand } from "../../entity-commands";
import {
  CAD_MEXICAN_LAYERS,
  cadMexicanLayerDefs,
  type CadMexicanLayerGroup,
} from "../../standards/mexican-layers";
import {
  cadMexicanDimensionStyles,
  cadMexicanTextStyles,
} from "../../standards/mexican-annotation";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

/**
 * Escala sugerida para las alturas de rótulo.
 *
 * 1:50 es la escala del plano arquitectónico mexicano por defecto. Se SUGIERE y
 * se pregunta, nunca se supone: la altura de la letra depende de la escala, y
 * sembrar rótulos calculados para 1:50 en un dibujo que va a 1:100 los saca a la
 * mitad de tamaño — un defecto que no se ve hasta imprimir.
 */
const DEFAULT_SCALE = 50;

const OPTIONS = [
  { keyword: "Todo", shortcut: "T" },
  { keyword: "Arquitectura", shortcut: "A" },
  { keyword: "Demolición", shortcut: "D" },
  { keyword: "Estructura", shortcut: "E" },
  { keyword: "Instalaciones", shortcut: "I" },
  { keyword: "Sitio", shortcut: "S" },
  { keyword: "estiLos", shortcut: "L" },
] as const;

/** Qué grupos de la norma trae cada opción del menú. */
const GROUPS: Readonly<Record<string, readonly CadMexicanLayerGroup[]>> = {
  Todo: ["referencia", "arquitectura", "demolicion", "estructura", "instalaciones", "sitio", "anotacion"],
  Arquitectura: ["referencia", "arquitectura", "anotacion"],
  Demolición: ["referencia", "demolicion", "arquitectura", "anotacion"],
  Estructura: ["referencia", "estructura", "anotacion"],
  Instalaciones: ["referencia", "instalaciones", "anotacion"],
  Sitio: ["referencia", "sitio", "anotacion"],
};

interface NormaState {
  /** Opción elegida en el primer paso. `null` mientras no se ha elegido. */
  readonly choice: string | null;
}

function menu(state: NormaState): CadCommandStep<NormaState> {
  return {
    state,
    prompt: { message: "Qué se añade de la norma de dibujo mexicana", options: [...OPTIONS] },
    accepts: CAD_ACCEPT_KEYWORD,
  };
}

function askScale(state: NormaState): CadCommandStep<NormaState> {
  return {
    state,
    prompt: {
      message: "Denominador de la escala del dibujo, para la altura de los rótulos",
      options: [],
      defaultValue: String(DEFAULT_SCALE),
    },
    accepts: CAD_ACCEPT_DISTANCE,
  };
}

function message(state: NormaState, text: string): CadCommandStep<NormaState> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

function cancelled(state: NormaState): CadCommandStep<NormaState> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
}

/** Ids de capa que el dibujo ya declara, en mayúsculas para comparar sin distinguir. */
function declaredLayerIds(context: CadCommandContext): Set<string> {
  const layers = context.layers?.() ?? [];
  return new Set(layers.map((layer) => layer.id.toUpperCase()));
}

/** Órdenes para las capas de esos grupos que el dibujo NO tenga todavía. */
function missingLayerCommands(
  context: CadCommandContext,
  groups: readonly CadMexicanLayerGroup[],
): CadEntityCommand[] {
  const declared = declaredLayerIds(context);
  const wanted = CAD_MEXICAN_LAYERS.filter(
    (item) => groups.includes(item.group) && !declared.has(item.id.toUpperCase()),
  ).map((item) => item.id);
  return cadMexicanLayerDefs(wanted).map((layer) => ({
    type: "layer",
    op: "upsert",
    layer,
  }));
}

/**
 * Órdenes para los estilos de texto y cota que falten.
 *
 * Los de COTA no dependen de la escala tecleada: cada uno lleva la suya en el
 * nombre (`COTA 1:75`) y su garrapata calculada para ella, así que se siembran
 * los ocho y el arquitecto elige. Los de TEXTO sí: `ROTULO` tiene una altura
 * concreta, y ésa es la que hay que preguntar.
 */
function missingStyleCommands(context: CadCommandContext, scale: number): CadEntityCommand[] {
  const document = context.document?.();
  const unit = document?.meta?.unit ?? "mm";
  const existingText = new Set(Object.keys(document?.styles?.text ?? {}));
  const existingDimension = new Set(Object.keys(document?.styles?.dimension ?? {}));
  const commands: CadEntityCommand[] = [];

  for (const [name, values] of Object.entries(cadMexicanTextStyles(scale, unit)))
    if (!existingText.has(name))
      commands.push({ type: "style", op: "upsert", family: "text", name, values });

  for (const [name, values] of Object.entries(cadMexicanDimensionStyles(unit)))
    if (!existingDimension.has(name))
      commands.push({
        type: "style",
        op: "upsert",
        family: "dimension",
        name,
        // La definición tipada tiene campos opcionales; el comando transporta
        // sólo los presentes (nunca hay `undefined` en los estilos de la norma).
        values: values as Readonly<Record<string, string | number | boolean>>,
      });

  return commands;
}

const normaCommand: CadCommandDescriptor<NormaState> = {
  name: "NORMAMX",
  aliases: ["CAPASMX"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: true,
  cursor: "none",
  begin: () => menu({ choice: null }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cancelled(state);

    if (state.choice === null) {
      // Sin opción no hay nada por defecto que aplicar, así que Intro sale en
      // vez de repreguntar: una orden que no se puede abandonar con Intro es
      // una orden que se abandona con Escape y deja al usuario desconfiando.
      if (input.kind === "enter") return cancelled(state);
      if (input.kind !== "keyword") return menu(state);

      // Sin tabla de capas no se puede saber qué falta, y añadir a ciegas
      // repintaría capas que el arquitecto configuró a conciencia.
      if (!context.layers)
        return message(
          state,
          "El editor no expone la tabla de capas, así que no se puede saber cuáles faltan. " +
            "Añadir las de la norma a ciegas repintaría las que ya tienes.",
        );
      if (!GROUPS[input.keyword] && input.keyword !== "estiLos") return menu(state);
      // Sólo se pregunta la escala cuando hace falta para algo. Preguntarla para
      // añadir cuatro capas sería un paso que no decide nada.
      const next = { choice: input.keyword };
      return needsStyles(input.keyword) ? askScale(next) : apply(next, context, DEFAULT_SCALE);
    }

    // `enter` acepta la escala sugerida; un número la fija.
    if (input.kind === "enter") return apply(state, context, DEFAULT_SCALE);
    if (input.kind !== "distance") return askScale(state);
    if (!(input.value > 0))
      return message(state, "El denominador de la escala tiene que ser mayor que cero.");
    return apply(state, context, input.value);
  },
};

function needsStyles(choice: string): boolean {
  return choice === "estiLos" || choice === "Todo";
}

function apply(
  state: NormaState,
  context: CadCommandContext,
  scale: number,
): CadCommandStep<NormaState> {
  const choice = state.choice ?? "Todo";
  const groups = GROUPS[choice] ?? [];
  const layerCommands = groups.length > 0 ? missingLayerCommands(context, groups) : [];
  const styleCommands = needsStyles(choice) ? missingStyleCommands(context, scale) : [];
  const commands = [...layerCommands, ...styleCommands];

  // Nada que hacer se DICE. Un lote vacío subiría la versión del documento y
  // gastaría un paso de deshacer para no cambiar nada.
  if (commands.length === 0)
    return message(
      state,
      `El dibujo ya trae todo lo que «${choice}» añadiría de la norma de dibujo mexicana.`,
    );

  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "document",
      commands,
      label:
        `NORMAMX ${choice}: +${layerCommands.length} capa(s), ` +
        `+${styleCommands.length} estilo(s) de la norma de dibujo mexicana`,
    },
  };
}

export const CAD_MEXICAN_STANDARD_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(normaCommand),
];
