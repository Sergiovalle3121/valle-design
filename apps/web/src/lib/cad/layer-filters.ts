/**
 * Filtros de capa: por NOMBRE, COLOR, ESTADO o USO — y por GRUPO, una lista
 * explícita. Lo que un despacho de verdad necesita antes de tocar una capa en
 * un dibujo de 120: encontrar "A-*" sin desplazarse por la tabla entera.
 *
 * ## No es lo mismo que el filtro de la paleta
 *
 * `components/cad/palettes/layer-manager-model.ts` ya tiene un filtro —texto
 * más UNA propiedad de una lista fija (`CadLayerFilterProperty`)— pero es un
 * filtro RÁPIDO sobre filas de interfaz: una sola propiedad a la vez, sin
 * patrón de nombre, sin guardar, sin grupos. Este módulo es la máquina
 * COMPLETA —criterios combinables con Y, comodín de nombre, filtros
 * guardados, grupos— y vive en `lib/` por la misma razón por la que
 * `layer-states.ts` es hoy la maquinaria canónica de LAYERSTATE y no una
 * copia dentro de la paleta (así lo dice la cabecera de ese archivo): dos
 * implementaciones del mismo concepto divergen. Cuando una ola de interfaz
 * necesite el filtro completo, este es el sitio; el de la paleta puede
 * seguir para el caso rápido, o construirse sobre este.
 *
 * ## MODELO de datos, no interfaz
 *
 * Esto es sólo el MOTOR de coincidencia y el catálogo de filtros guardados.
 * No hay comando tecleable ni paleta: la interfaz es territorio de otra ola.
 * Tampoco se toca `CadSessionCatalogs` en `command-types.ts` —esa ampliación
 * está bajo llave de otra sesión de esta misma campaña—, así que el catálogo
 * de aquí es una clase EXPORTADA e independiente, que quien monte la paleta
 * instancia por su cuenta, igual que hacía `CadLayerStateCatalog` antes de
 * que LAYERSTATE subiera al documento.
 *
 * ## Por qué GUARDADO vive en la SESIÓN y no en el documento
 *
 * LAYERSTATE subió al esquema 9 porque una foto de "cómo se ve el dibujo"
 * es un dato del PLANO: dos personas abriendo el mismo archivo esperan
 * encontrar los mismos estados. Un filtro guardado es distinto: es una forma
 * de MIRAR la tabla, no un dato del dibujo — cada quien puede querer ver
 * "A-*" sin que eso viaje con el archivo ni lo vea el resto del despacho.
 * Si una ola de interfaz futura decide que SÍ debe sobrevivir a la recarga,
 * el mismo camino que subió `layerStates` (una sección opcional en
 * `CadDocument` con su propio tipo de orden en `entity-command-tables.ts`)
 * sirve aquí sin tocar el motor de coincidencia de este archivo.
 */
import type { CadEntity, CadLayerDef } from "./cad-document";

export type CadLayerFilterState =
  | "on"
  | "off"
  | "frozen"
  | "thawed"
  | "locked"
  | "unlocked"
  | "plot"
  | "noplot";

export interface CadLayerFilterCriteria {
  /** Patrón de nombre estilo AutoCAD (ver `compileCadLayerNamePattern`). */
  namePattern?: string;
  /** Color EXACTO, en el mismo formato que `CadLayerDef.color`. */
  color?: string;
  /** Todos los estados deben cumplirse (Y, no O): `["frozen","locked"]` pide ambos. */
  states?: readonly CadLayerFilterState[];
  /** Si la capa tiene alguna entidad (necesita `usedLayerNames`, ver abajo). */
  usage?: "used" | "unused";
}

export class CadLayerFilterPatternError extends Error {
  readonly code = "cad_layer_filter_pattern_invalid";
  constructor(pattern: string, reason: string) {
    super(`El patrón de nombre "${pattern}" no es válido: ${reason}`);
    this.name = "CadLayerFilterPatternError";
  }
}

// Vocabulario soportado: `*` (cualquier texto, incluido vacío), `?` (un
// carácter cualquiera) y `~` AL PRINCIPIO (niega el patrón entero, como en
// AutoCAD). El resto del comodín de AutoCAD —`#` dígito, `@` letra, `.` no
// alfanumérico, `[abc]`/`[~abc]` clases de carácter— NO está implementado
// todavía. Un patrón que lo use se RECHAZA con la razón en vez de tratar esos
// caracteres como texto literal, que sería aproximar en silencio: un filtro
// "A-[12]" que en realidad buscara la cadena literal "[12]" devolvería una
// lista vacía sin que nadie supiera por qué.
const UNSUPPORTED_WILDCARD = /[#@.[\]]/;

/**
 * Compila un patrón de nombre en una función de coincidencia. Lanza
 * `CadLayerFilterPatternError` si el patrón usa comodines no soportados.
 */
export function compileCadLayerNamePattern(pattern: string): (name: string) => boolean {
  const negate = pattern.startsWith("~");
  const body = negate ? pattern.slice(1) : pattern;
  if (UNSUPPORTED_WILDCARD.test(body))
    throw new CadLayerFilterPatternError(
      pattern,
      "sólo se admiten «*» (cualquier texto), «?» (un carácter) y «~» inicial (negar); " +
        "#, @, ., [ y ] de AutoCAD todavía no están implementados.",
    );
  const source = body
    .split("")
    .map((char) => {
      if (char === "*") return ".*";
      if (char === "?") return ".";
      return /[.*+?^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
    })
    .join("");
  const regExp = new RegExp(`^${source}$`, "i");
  return (name: string) => negate !== regExp.test(name);
}

function matchesState(layer: CadLayerDef, state: CadLayerFilterState): boolean {
  switch (state) {
    case "on":
      return layer.visible;
    case "off":
      return !layer.visible;
    case "frozen":
      return layer.frozen === true;
    case "thawed":
      return layer.frozen !== true;
    case "locked":
      return layer.locked;
    case "unlocked":
      return !layer.locked;
    case "plot":
      return layer.plot !== false;
    case "noplot":
      return layer.plot === false;
  }
}

/**
 * Nombres de capa en USO, en mayúsculas, a partir de las entidades del
 * dibujo (`document.entities`; el llamador decide si suma las de dentro de
 * los bloques). Sirve de segundo argumento a `matchesCadLayerFilter`/
 * `applyCadLayerFilter` cuando el criterio trae `usage`.
 */
export function cadLayerNamesInUse(entities: readonly CadEntity[]): ReadonlySet<string> {
  const used = new Set<string>();
  for (const entity of entities) {
    if ("layer" in entity && typeof entity.layer === "string") used.add(entity.layer.toUpperCase());
  }
  return used;
}

/**
 * ¿Cumple esta capa el criterio? Cada campo presente en `criteria` es
 * obligatorio (Y): un criterio vacío `{}` acepta cualquier capa.
 *
 * `usage` necesita `usedLayerNames` (de `cadLayerNamesInUse`); pedirlo sin
 * pasarlo lanza en vez de fingir que ninguna capa está en uso.
 */
export function matchesCadLayerFilter(
  layer: CadLayerDef,
  criteria: CadLayerFilterCriteria,
  usedLayerNames?: ReadonlySet<string>,
): boolean {
  if (criteria.namePattern !== undefined && !compileCadLayerNamePattern(criteria.namePattern)(layer.name))
    return false;
  if (criteria.color !== undefined && layer.color.toLowerCase() !== criteria.color.toLowerCase())
    return false;
  if (criteria.states) {
    for (const state of criteria.states) if (!matchesState(layer, state)) return false;
  }
  if (criteria.usage !== undefined) {
    if (!usedLayerNames)
      throw new Error(
        "El filtro por USO necesita `usedLayerNames` (cadLayerNamesInUse(document.entities)).",
      );
    const used = usedLayerNames.has(layer.name.toUpperCase());
    if (criteria.usage === "used" && !used) return false;
    if (criteria.usage === "unused" && used) return false;
  }
  return true;
}

/** Filtra la tabla completa. Devuelve las capas EN EL MISMO ORDEN en que llegaron. */
export function applyCadLayerFilter(
  layers: readonly CadLayerDef[],
  criteria: CadLayerFilterCriteria,
  usedLayerNames?: ReadonlySet<string>,
): readonly CadLayerDef[] {
  return layers.filter((layer) => matchesCadLayerFilter(layer, criteria, usedLayerNames));
}

/** Filtro por GRUPO: pertenencia EXPLÍCITA, sin patrón — como una carpeta a la que se arrastran capas. */
export interface CadLayerGroupFilter {
  name: string;
  layerNames: readonly string[];
}

export function matchesCadLayerGroupFilter(layer: CadLayerDef, group: CadLayerGroupFilter): boolean {
  const key = layer.name.toUpperCase();
  return group.layerNames.some((name) => name.trim().toUpperCase() === key);
}

export function applyCadLayerGroupFilter(
  layers: readonly CadLayerDef[],
  group: CadLayerGroupFilter,
): readonly CadLayerDef[] {
  return layers.filter((layer) => matchesCadLayerGroupFilter(layer, group));
}

// ---------------------------------------------------------------------------
// Filtros GUARDADOS — catálogo de sesión (ver la cabecera del archivo)
// ---------------------------------------------------------------------------

export type CadNamedLayerFilter =
  | { kind: "criteria"; name: string; criteria: CadLayerFilterCriteria }
  | { kind: "group"; name: string; layerNames: readonly string[] };

/**
 * Catálogo de filtros guardados, con el mismo contrato que los demás
 * catálogos de sesión (`CadLayerStateCatalog`, `CadUcsCatalog`…): el nombre
 * es la identidad sin distinguir mayúsculas, y `save` sustituye por nombre.
 */
export class CadLayerFilterCatalog {
  private items: CadNamedLayerFilter[] = [];

  list = (): readonly CadNamedLayerFilter[] => this.items;

  get = (name: string): CadNamedLayerFilter | undefined =>
    this.items.find((item) => item.name.toUpperCase() === name.trim().toUpperCase());

  save = (item: CadNamedLayerFilter): void => {
    const key = item.name.trim().toUpperCase();
    const index = this.items.findIndex((entry) => entry.name.toUpperCase() === key);
    if (index >= 0) this.items = this.items.map((entry, at) => (at === index ? item : entry));
    else this.items = [...this.items, item].sort((a, b) => a.name.localeCompare(b.name));
  };

  remove = (name: string): boolean => {
    const key = name.trim().toUpperCase();
    const next = this.items.filter((entry) => entry.name.toUpperCase() !== key);
    if (next.length === this.items.length) return false;
    this.items = next;
    return true;
  };

  /** Aplica un filtro guardado por nombre. `undefined` si no existe con ese nombre. */
  apply = (
    name: string,
    layers: readonly CadLayerDef[],
    usedLayerNames?: ReadonlySet<string>,
  ): readonly CadLayerDef[] | undefined => {
    const found = this.get(name);
    if (!found) return undefined;
    return found.kind === "group"
      ? applyCadLayerGroupFilter(layers, found)
      : applyCadLayerFilter(layers, found.criteria, usedLayerNames);
  };
}
