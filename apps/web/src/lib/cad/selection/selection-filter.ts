/**
 * Selección por propiedades: el motor de QSELECT y de FILTER.
 *
 * ## La decisión que hace que esto envejezca bien
 *
 * Las propiedades por las que se filtra NO están escritas aquí. Salen de
 * `properties.read` del registro de adaptadores, que es donde cada tipo de
 * entidad declara qué sabe de sí mismo. La consecuencia es concreta: el día que
 * T7 registre el sólido 3D o la ola siguiente registre lo que sea, QSELECT
 * podrá filtrar por sus propiedades sin que nadie toque este archivo ni se
 * acuerde de venir a añadirlas.
 *
 * Una lista escrita a mano habría funcionado igual de bien hoy y habría estado
 * desfasada en la ola siguiente, en silencio y sin fallar ningún test.
 *
 * ## Las cuatro que el registro no da
 *
 * `type`, `color`, `linetype` y `lineweight` no viven en `properties.read`:
 * el tipo es la etiqueta de la unión y los otros tres viven en
 * `context.presentation`, que es por documento y no por adaptador. Se añaden
 * aquí explícitamente y se marcan como universales, porque son exactamente las
 * cuatro por las que más se filtra.
 */
import type { CadEntity } from "../cad-document";
import {
  CAD_ENTITY_REGISTRY,
  type CadEntityRegistry,
  type CadPropertyValue,
} from "../entity-runtime";

/**
 * Los operadores de QSELECT, con el mismo repertorio que AutoCAD. `~` es la
 * comparación con comodines (`MURO*`), que es la que se usa para filtrar por
 * familias de capa y que ningún operador numérico puede sustituir.
 */
export type CadFilterOperator = "=" | "!=" | ">" | "<" | ">=" | "<=" | "~";

export const CAD_FILTER_OPERATORS: readonly CadFilterOperator[] = [
  "=",
  "!=",
  ">",
  "<",
  ">=",
  "<=",
  "~",
];

export interface CadFilterRule {
  property: string;
  operator: CadFilterOperator;
  value: string;
}

export interface CadSelectionFilter {
  /**
   * Tipo de entidad al que se restringe, o `null` para todos. Va aparte de las
   * reglas porque en AutoCAD también va aparte: es lo primero que se elige y lo
   * que decide qué propiedades ofrece el resto del cuadro.
   */
  entityType: string | null;
  rules: readonly CadFilterRule[];
  /** Cómo se combinan las reglas entre sí. */
  combine: "and" | "or";
}

export interface CadNamedSelectionFilter extends CadSelectionFilter {
  name: string;
}

export const EMPTY_CAD_SELECTION_FILTER: CadSelectionFilter = {
  entityType: null,
  rules: [],
  combine: "and",
};

/** Cómo se aplica el resultado a lo que ya estaba designado. */
export type CadSelectionMode = "replace" | "append" | "exclude";

export interface CadFilterableProperty {
  name: string;
  /** `true` para las cuatro que valen para cualquier entidad. */
  universal: boolean;
  /** Tipos que la declaran. Vacío en las universales. */
  types: readonly string[];
  kind: "string" | "number" | "boolean";
}

const UNIVERSAL: readonly CadFilterableProperty[] = [
  { name: "type", universal: true, types: [], kind: "string" },
  { name: "layer", universal: true, types: [], kind: "string" },
  { name: "color", universal: true, types: [], kind: "string" },
  { name: "linetype", universal: true, types: [], kind: "string" },
  { name: "lineweight", universal: true, types: [], kind: "number" },
];

const UNIVERSAL_NAMES = new Set(UNIVERSAL.map((property) => property.name));

/**
 * Lee una propiedad de una entidad. Devuelve `undefined` cuando la entidad no
 * la tiene, que NO es lo mismo que valer cero o cadena vacía: una regla sobre
 * una propiedad ausente no se cumple, en vez de cumplirse por comparar contra
 * un valor inventado.
 */
export function readCadFilterProperty(
  entity: CadEntity,
  property: string,
  registry: CadEntityRegistry = CAD_ENTITY_REGISTRY,
): CadPropertyValue | undefined {
  if (property === "type") return entity.type;
  const presentation = "context" in entity ? entity.context?.presentation : undefined;
  if (property === "color")
    return presentation?.color?.value ?? presentation?.color?.source ?? "byLayer";
  if (property === "linetype")
    return presentation?.linetype?.value ?? presentation?.linetype?.source ?? "byLayer";
  if (property === "lineweight") return presentation?.lineweight?.value ?? -1;
  if (!registry.supports(entity)) return property === "layer" && "layer" in entity ? entity.layer : undefined;
  return registry.adapter(entity).properties.read(entity)[property];
}

/**
 * Qué propiedades ofrece un conjunto de entidades.
 *
 * Se calcula sobre las entidades PRESENTES y no sobre el registro entero: un
 * desplegable con `majorAxisX` en un dibujo sin elipses es ruido, y un dibujo
 * de mil líneas ofrece seis opciones en vez de sesenta.
 */
export function cadFilterableProperties(
  entities: readonly CadEntity[],
  registry: CadEntityRegistry = CAD_ENTITY_REGISTRY,
): CadFilterableProperty[] {
  const byName = new Map<string, { types: Set<string>; kind: CadFilterableProperty["kind"] }>();
  for (const entity of entities) {
    if (!registry.supports(entity)) continue;
    const bag = registry.adapter(entity).properties.read(entity);
    for (const [name, value] of Object.entries(bag)) {
      if (UNIVERSAL_NAMES.has(name)) continue;
      const entry = byName.get(name) ?? { types: new Set<string>(), kind: kindOf(value) };
      entry.types.add(entity.type);
      byName.set(name, entry);
    }
  }
  const specific = [...byName.entries()]
    .map(([name, entry]) => ({
      name,
      universal: false,
      types: [...entry.types].sort(),
      kind: entry.kind,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...UNIVERSAL, ...specific];
}

function kindOf(value: CadPropertyValue): CadFilterableProperty["kind"] {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

/** `MURO*` → expresión regular anclada. `?` es un carácter, `*` es cualquiera. */
export function cadWildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i");
}

function compare(actual: CadPropertyValue, rule: CadFilterRule): boolean {
  if (rule.operator === "~") return cadWildcardToRegExp(rule.value).test(String(actual));
  if (typeof actual === "number") {
    const expected = Number.parseFloat(rule.value);
    if (!Number.isFinite(expected)) return false;
    // Los reales no se comparan con `===`: una coordenada que salió de un giro
    // vale 9.999999999999998 y el usuario tecleó 10.
    const epsilon = 1e-9 * Math.max(1, Math.abs(actual), Math.abs(expected));
    switch (rule.operator) {
      case "=":
        return Math.abs(actual - expected) <= epsilon;
      case "!=":
        return Math.abs(actual - expected) > epsilon;
      case ">":
        return actual > expected + epsilon;
      case "<":
        return actual < expected - epsilon;
      case ">=":
        return actual >= expected - epsilon;
      case "<=":
        return actual <= expected + epsilon;
    }
  }
  const left = String(actual);
  switch (rule.operator) {
    case "=":
      return left.localeCompare(rule.value, undefined, { sensitivity: "accent" }) === 0;
    case "!=":
      return left.localeCompare(rule.value, undefined, { sensitivity: "accent" }) !== 0;
    case ">":
      return left > rule.value;
    case "<":
      return left < rule.value;
    case ">=":
      return left >= rule.value;
    case "<=":
      return left <= rule.value;
    default:
      return false;
  }
}

export function cadEntityMatchesFilter(
  entity: CadEntity,
  filter: CadSelectionFilter,
  registry: CadEntityRegistry = CAD_ENTITY_REGISTRY,
): boolean {
  if (filter.entityType && entity.type !== filter.entityType) return false;
  if (filter.rules.length === 0) return true;
  const results = filter.rules.map((rule) => {
    const actual = readCadFilterProperty(entity, rule.property, registry);
    if (actual === undefined) return false;
    return compare(actual, rule);
  });
  return filter.combine === "or" ? results.some(Boolean) : results.every(Boolean);
}

export interface CadFilterOutcome {
  /** Lo que hay que dejar designado, ya combinado con la selección previa. */
  selection: readonly string[];
  /** Lo que casó con el filtro, sin combinar. */
  matched: readonly string[];
  /** Cuántas entidades se examinaron. */
  examined: number;
}

/**
 * Aplica el filtro y COMBINA con lo que ya estuviera designado.
 *
 * La combinación es la mitad del valor de QSELECT: «añade a la selección
 * actual» es como se construye «todas las líneas de MUROS más todos los
 * círculos de PILARES», que ningún filtro de una sola pasada expresa.
 */
export function applyCadSelectionFilter(
  entities: readonly CadEntity[],
  filter: CadSelectionFilter,
  options: {
    mode?: CadSelectionMode;
    current?: readonly string[];
    /** Limita el examen a lo designado, como el «añadir a la selección» inverso. */
    scope?: readonly string[];
    registry?: CadEntityRegistry;
  } = {},
): CadFilterOutcome {
  const registry = options.registry ?? CAD_ENTITY_REGISTRY;
  const mode = options.mode ?? "replace";
  const current = options.current ?? [];
  const scope = options.scope ? new Set(options.scope) : null;
  const candidates = scope ? entities.filter((entity) => scope.has(entity.id)) : entities;
  const matched = candidates
    .filter((entity) => cadEntityMatchesFilter(entity, filter, registry))
    .map((entity) => entity.id);

  if (mode === "replace")
    return { selection: matched, matched, examined: candidates.length };
  if (mode === "append") {
    const seen = new Set(current);
    return {
      selection: [...current, ...matched.filter((id) => !seen.has(id))],
      matched,
      examined: candidates.length,
    };
  }
  const removed = new Set(matched);
  return {
    selection: current.filter((id) => !removed.has(id)),
    matched,
    examined: candidates.length,
  };
}

/** Catálogo en memoria de filtros con nombre. El de FILTER en la sesión. */
export class CadFilterCatalog {
  private items: CadNamedSelectionFilter[] = [];

  list = (): readonly CadNamedSelectionFilter[] => this.items;

  get = (name: string): CadNamedSelectionFilter | undefined =>
    this.items.find((item) => item.name.toUpperCase() === name.trim().toUpperCase());

  save = (item: CadNamedSelectionFilter): void => {
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
}
