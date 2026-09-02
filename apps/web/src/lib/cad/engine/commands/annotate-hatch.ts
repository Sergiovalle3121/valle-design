/**
 * HATCH, GRADIENT y BOUNDARY.
 *
 * ## Las cuatro reglas de islas de AutoCAD sobre tres valores de esquema
 *
 * El esquema canónico guarda `islandStyle: "normal" | "outer" | "ignore"`. La
 * orden ofrece las CUATRO palabras que un dibujante espera —Normal, Exterior,
 * Ignorar y Ninguna— y `Ninguna` materializa `ignore`, porque la región que
 * resulta es la misma: rellenar todo lo encerrado por el contorno exterior. La
 * diferencia de AutoCAD entre ambas es de qué anillos se recuerdan como objetos
 * de contorno, no de qué se rellena. Se dice aquí y en el PR en vez de inventar
 * un cuarto valor en `cad-document.ts`, que es de otra sesión.
 *
 * ## Los valores por defecto que se emiten NO son cero y uno
 *
 * El renderizador dibuja con `angle ?? 45` y `scale ?? diagonal/40`; la lectura
 * de propiedades informa `angle ?? 0` y `scale ?? 1`. Un HATCH que no fije esos
 * campos se dibuja de una manera y se describe de otra, y en cuanto alguien toca
 * cualquier propiedad se materializa el 0 y el 1 y el sombreado se convierte en
 * una mancha. Estas órdenes los emiten EXPLÍCITOS y con el valor del
 * renderizador, así que lo guardado es lo dibujado.
 *
 * ## El sombreado nace DETRÁS
 *
 * `drawOrder: "back"`. Un relleno creado al frente tapa la geometría que acaba
 * de delimitarlo, y el dibujante tiene que ir a «enviar al fondo» cada vez.
 *
 * ## GRADIENT queda a medias, y se dice
 *
 * El esquema no modela un degradado: `hatch` tiene patrón, escala, ángulo y
 * sólido, y nada donde poner dos colores y una dirección. La orden materializa
 * un relleno SÓLIDO con el color inicial y guarda los dos colores en
 * `context.metadata` para no perderlos. No es un degradado; es lo más parecido
 * que el documento sabe guardar hoy sin tocar el esquema.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadNativeEntity } from "../../entity-runtime";
import {
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
import { cadCommandCancelled, cadCommandRefused, cadCommandWrites, flat } from "./annotate-support";
import {
  cadHatchRegionAtPoint,
  cadHatchRegionFromObjects,
  cadHatchSpacing,
  cadSelfIntersectingBoundarySources,
  type CadHatchRegion,
  type CadIslandStyle,
} from "./hatch-support";
import { cadHatchPatternBaseAngle } from "../../hatch-pattern-table";

/** Un contorno que se cruza consigo mismo no delimita región: se dice cuál. */
const contornoCruzado = (sources: readonly string[]): string =>
  `El contorno se cruza consigo mismo (${sources.join(", ")}). Un perímetro que se corta ` +
  "no delimita una región: separa los tramos cruzados o recórtalos en el punto de cruce.";

const OBJECTS = { keyword: "Objetos", shortcut: "O" } as const;
const PATTERN = { keyword: "Patrón", shortcut: "P" } as const;
const ANGLE = { keyword: "ánGulo", shortcut: "G" } as const;
const SCALE = { keyword: "Escala", shortcut: "E" } as const;
const ISLANDS = { keyword: "Islas", shortcut: "I" } as const;
const SOLID = { keyword: "Sólido", shortcut: "S" } as const;
const COLOR = { keyword: "Color", shortcut: "C" } as const;

const NORMAL = { keyword: "Normal", shortcut: "N" } as const;
const OUTER = { keyword: "Exterior", shortcut: "E" } as const;
const IGNORE = { keyword: "Ignorar", shortcut: "I" } as const;
const NONE = { keyword: "Ninguna", shortcut: "G" } as const;

/**
 * Las cuatro palabras de AutoCAD sobre los tres valores del esquema. `Ninguna`
 * y `Ignorar` rellenan la misma región; ver la cabecera del archivo.
 */
const ISLAND_STYLES: Readonly<Record<string, CadIslandStyle>> = {
  [NORMAL.keyword]: "normal",
  [OUTER.keyword]: "outer",
  [IGNORE.keyword]: "ignore",
  [NONE.keyword]: "ignore",
};

const DEFAULT_ANGLE = 45;

type Mode = "hatch" | "gradient" | "boundary";
type Pending = "pick" | "objects" | "pattern" | "angle" | "scale" | "islands" | "color";

interface HatchState {
  mode: Mode;
  pattern: string;
  solid: boolean;
  angle: number;
  /** El usuario tecleó un ángulo: elegir otro patrón ya no lo sustituye por la base del patrón. */
  angleTyped?: boolean;
  /** `null` = el espaciado se deriva del tamaño real del contorno. */
  scale: number | null;
  islandStyle: CadIslandStyle;
  islandKeyword: string;
  colors: string[];
  pending: Pending;
}

const PROMPTS: Readonly<Record<Pending, string>> = {
  pick: "Precise un punto interior del contorno",
  objects: "Designe los objetos que forman el contorno",
  pattern: "Escriba el nombre del patrón",
  angle: "Precise el ángulo del patrón",
  scale: "Precise el espaciado del patrón",
  islands: "Precise la detección de islas",
  color: "Escriba los colores del degradado, separados por coma",
};

function hatchStep(state: HatchState, context: CadCommandContext): CadCommandStep<HatchState> {
  const patternOptions =
    state.mode === "gradient"
      ? [OBJECTS, COLOR, ANGLE, ISLANDS]
      : state.mode === "boundary"
        ? [OBJECTS, ISLANDS]
        : [OBJECTS, PATTERN, ANGLE, SCALE, ISLANDS, SOLID];
  return {
    state,
    prompt: {
      message: PROMPTS[state.pending],
      options:
        state.pending === "pick"
          ? patternOptions
          : state.pending === "islands"
            ? [NORMAL, OUTER, IGNORE, NONE]
            : [],
      ...(state.pending === "angle" ? { defaultValue: String(state.angle) } : {}),
      ...(state.pending === "islands" ? { defaultValue: state.islandKeyword } : {}),
    },
    accepts:
      state.pending === "pick"
        ? CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD
        : state.pending === "objects"
          ? CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_KEYWORD
          : state.pending === "islands"
            ? CAD_ACCEPT_KEYWORD
            : state.pending === "pattern" || state.pending === "color"
              ? CAD_ACCEPT_TEXT
              : CAD_ACCEPT_DISTANCE,
    preview: context.cursor && state.pending === "pick" ? [{ points: [context.cursor] }] : [],
  };
}

/** El HATCH (o los contornos de BOUNDARY) que sale de una región ya resuelta. */
function emit(
  state: HatchState,
  region: CadHatchRegion,
  context: CadCommandContext,
): CadCommandStep<HatchState> {
  if (state.mode === "boundary") {
    // BOUNDARY no rellena: DIBUJA el contorno como polilíneas cerradas, que es
    // lo que se usa después para medir el área o para extruir.
    const commands = region.boundaries.map((loop) => ({
      type: "insert" as const,
      entity: {
        id: context.newEntityId(),
        type: "polyline" as const,
        vertices: loop.map((point) => flat(point)),
        closed: true,
        layer: context.activeLayer,
      } satisfies CadNativeEntity,
    }));
    return cadCommandWrites(state, commands, "BOUNDARY");
  }

  const gradient = state.mode === "gradient";
  const spacing = state.scale ?? cadHatchSpacing(region.boundaries);
  const entity: CadNativeEntity = {
    id: context.newEntityId(),
    type: "hatch",
    pattern: gradient ? "GRADIENT" : state.pattern,
    solid: gradient || state.solid,
    boundaries: region.boundaries.map((loop) => loop.map((point) => flat(point))),
    // Explícitos y con el valor del RENDERIZADOR: ver la cabecera.
    angle: state.angle,
    scale: spacing,
    islandStyle: state.islandStyle,
    ...(region.sourceIds.length > 0
      ? {
          associative: true,
          associationStatus: "associated" as const,
          boundaryRefs: [...region.sourceIds],
        }
      : {}),
    ...(gradient
      ? {
          context: {
            presentation: { color: { source: "explicit", value: state.colors[0] } },
            // Los dos colores se guardan para que un futuro degradado real los
            // encuentre. Perderlos y volver a preguntarlos sería peor.
            metadata: { gradientFrom: state.colors[0], gradientTo: state.colors[1] ?? state.colors[0] },
          },
        }
      : {}),
    layer: context.activeLayer,
  };
  // Detrás: un relleno al frente tapa la geometría que acaba de delimitarlo.
  return cadCommandWrites(
    state,
    [{ type: "insert", entity, drawOrder: "back" }],
    gradient ? "GRADIENT" : "HATCH",
  );
}

function fromPoint(
  state: HatchState,
  point: CadPoint2,
  context: CadCommandContext,
): CadCommandStep<HatchState> {
  const region = cadHatchRegionAtPoint(point, context, state.islandStyle);
  if (!region) {
    // El diagnóstico ANTES del consejo. Un contorno que se cruza consigo mismo
    // está cerrado, así que «cierra el perímetro» manda a buscar un hueco que
    // no existe; con el nombre del objeto delante la corrección es evidente.
    const cruzados = cadSelfIntersectingBoundarySources(context);
    if (cruzados.length)
      return cadCommandRefused(state, contornoCruzado(cruzados));
    return cadCommandRefused(
      state,
      `El punto (${point.x}, ${point.y}) no está dentro de ningún contorno cerrado. ` +
        "Cierra el perímetro o designa los objetos que lo forman.",
    );
  }
  return emit(state, region, context);
}

function fromObjects(
  state: HatchState,
  entityIds: readonly string[],
  context: CadCommandContext,
): CadCommandStep<HatchState> {
  if (entityIds.length === 0) return cadCommandCancelled(state);
  const region = cadHatchRegionFromObjects(entityIds, context, state.islandStyle);
  if (!region) {
    const cruzados = cadSelfIntersectingBoundarySources(context, entityIds);
    if (cruzados.length)
      return cadCommandRefused(state, contornoCruzado(cruzados));
    return cadCommandRefused(
      state,
      `Los ${entityIds.length} objeto(s) designados no encierran ninguna región. ` +
        "Un contorno tiene que cerrarse: comprueba que no queden extremos sueltos.",
    );
  }
  return emit(state, region, context);
}

function descriptor(mode: Mode): CadCommandDescriptor<HatchState> {
  const empty: HatchState = {
    mode,
    pattern: "ANSI31",
    solid: false,
    angle: DEFAULT_ANGLE,
    scale: null,
    islandStyle: "normal",
    islandKeyword: NORMAL.keyword,
    colors: ["#3b82f6", "#0f172a"],
    pending: "pick",
  };
  const name = mode === "hatch" ? "HATCH" : mode === "gradient" ? "GRADIENT" : "BOUNDARY";
  return {
    name,
    aliases: mode === "hatch" ? ["H", "BH"] : mode === "gradient" ? ["GD"] : ["BO"],
    // Las tres son de DIBUJO: crean geometría. BOUNDARY traza polilíneas y las
    // otras dos rellenan, pero ninguna anota nada sobre lo que ya hay.
    kind: "draw",
    transparent: false,
    selection: "optional",
    repeatable: true,
    mutates: true,
    cursor: "crosshair",
    begin: (context) =>
      context.selection.length > 0
        ? fromObjects(empty, context.selection, context)
        : hatchStep(empty, context),
    step: (state, input, context) => {
      if (input.kind === "cancel") return cadCommandCancelled(state);

      if (input.kind === "keyword") {
        if (input.keyword === OBJECTS.keyword) return hatchStep({ ...state, pending: "objects" }, context);
        if (input.keyword === PATTERN.keyword) return hatchStep({ ...state, pending: "pattern" }, context);
        if (input.keyword === ANGLE.keyword) return hatchStep({ ...state, pending: "angle" }, context);
        if (input.keyword === SCALE.keyword) return hatchStep({ ...state, pending: "scale" }, context);
        if (input.keyword === COLOR.keyword) return hatchStep({ ...state, pending: "color" }, context);
        if (input.keyword === ISLANDS.keyword) return hatchStep({ ...state, pending: "islands" }, context);
        if (input.keyword === SOLID.keyword)
          return hatchStep({ ...state, solid: !state.solid, pending: "pick" }, context);
        const islandStyle = ISLAND_STYLES[input.keyword];
        if (islandStyle)
          return hatchStep(
            { ...state, islandStyle, islandKeyword: input.keyword, pending: "pick" },
            context,
          );
        return hatchStep(state, context);
      }

      if (input.kind === "text") {
        if (state.pending === "pattern") {
          const pattern = input.value.trim().toUpperCase().slice(0, 64) || "ANSI31";
          // `SOLID` como nombre de patrón es el relleno macizo: quien lo teclea
          // no espera que además le pinten rayas. El ángulo por defecto es la
          // BASE del patrón elegido (45 en ANSI31, 0 en BRICK): con el 45 de
          // ANSI31 fijo, un ladrillo salía girado 45°.
          return hatchStep(
            {
              ...state,
              pattern,
              solid: pattern === "SOLID",
              ...(state.angleTyped ? {} : { angle: cadHatchPatternBaseAngle(pattern) }),
              pending: "pick",
            },
            context,
          );
        }
        if (state.pending === "color") {
          const colors = input.value
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
            .slice(0, 2);
          return hatchStep(
            { ...state, colors: colors.length > 0 ? colors : state.colors, pending: "pick" },
            context,
          );
        }
        return hatchStep(state, context);
      }

      if (input.kind === "distance") {
        if (state.pending === "angle")
          return hatchStep({ ...state, angle: input.value, angleTyped: true, pending: "pick" }, context);
        if (state.pending === "scale") {
          const scale = Math.abs(input.value);
          if (!(scale > 1e-9))
            return cadCommandRefused(
              state,
              "Un espaciado de cero dibujaría infinitas líneas: el patrón no se puede materializar.",
            );
          return hatchStep({ ...state, scale, pending: "pick" }, context);
        }
      }

      if (input.kind === "point" && state.pending === "pick") return fromPoint(state, input.point, context);
      if (input.kind === "selection") return fromObjects(state, input.entityIds, context);
      if (input.kind === "entityPick" && state.pending === "objects")
        return fromObjects(state, [input.entityId], context);

      if (input.kind === "enter") return cadCommandCancelled(state);
      return hatchStep(state, context);
    },
  };
}

export const CAD_HATCH_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(descriptor("hatch")),
  asCadCommand(descriptor("gradient")),
  asCadCommand(descriptor("boundary")),
];
