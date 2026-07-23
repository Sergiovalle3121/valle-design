/**
 * Capas (LAYER) del CAD (AXOS-CAD-DEPTH-B4).
 *
 * La capa es cómo AutoCAD organiza un plano: cada entidad vive en una capa con
 * color, tipo de línea, grosor y estados (encendida/apagada, congelada,
 * bloqueada). Apagas la capa de mobiliario y desaparece; congelas la de cotas y
 * no estorba; bloqueas la de ejes y no la mueves sin querer. Las entidades
 * heredan color/tipo/grosor "ByLayer". La caja rectangular no tenía capas de
 * verdad. Módulo de datos puro, sin dependencias del editor.
 */

export type ByLayer = "byLayer";
export const BY_LAYER: ByLayer = "byLayer";

export interface CadLayer {
  name: string;
  /** Índice de color (ACI 1-255; 7 = por defecto). */
  color: number;
  /** Nombre del tipo de línea (p.ej. "CONTINUOUS", "DASHED"). */
  linetype: string;
  /** Grosor en mm; -1 = grosor por defecto. */
  lineweight: number;
  /** Encendida (visible). */
  on: boolean;
  /** Congelada (ni se dibuja ni se regenera). */
  frozen: boolean;
  /** Bloqueada (visible pero no editable). */
  locked: boolean;
}

export const DEFAULT_LAYER_NAME = "0";

/** Crea una capa con los valores por defecto de AutoCAD, aplicando overrides. */
export function makeLayer(
  name: string,
  overrides: Partial<Omit<CadLayer, "name">> = {},
): CadLayer {
  return {
    name,
    color: 7,
    linetype: "CONTINUOUS",
    lineweight: -1,
    on: true,
    frozen: false,
    locked: false,
    ...overrides,
  };
}

/** ¿La capa dibuja sus entidades? (encendida y no congelada). */
export function layerVisible(layer: CadLayer): boolean {
  return layer.on && !layer.frozen;
}

/** ¿Se pueden editar las entidades de la capa? (visible y no bloqueada). */
export function layerEditable(layer: CadLayer): boolean {
  return layerVisible(layer) && !layer.locked;
}

/** Color efectivo de una entidad: si es "byLayer", toma el de la capa. */
export function effectiveColor(
  entityColor: number | ByLayer,
  layer: CadLayer,
): number {
  return entityColor === BY_LAYER ? layer.color : entityColor;
}

/** Tipo de línea efectivo de una entidad: si es "byLayer", el de la capa. */
export function effectiveLinetype(
  entityLinetype: string | ByLayer,
  layer: CadLayer,
): string {
  return entityLinetype === BY_LAYER ? layer.linetype : entityLinetype;
}

/** Grosor efectivo de una entidad: si es "byLayer", el de la capa. */
export function effectiveLineweight(
  entityLineweight: number | ByLayer,
  layer: CadLayer,
): number {
  return entityLineweight === BY_LAYER ? layer.lineweight : entityLineweight;
}

/** ¿Nombre de capa válido? No vacío y sin caracteres prohibidos por DXF. */
export function isValidLayerName(name: string): boolean {
  if (!name || name.trim() !== name || name.length === 0) return false;
  return !/[<>/\\":;?*|=`,]/.test(name);
}

/** Registro de capas indexado por nombre (siempre incluye la capa "0"). */
export type LayerTable = Record<string, CadLayer>;

export function makeLayerTable(layers: CadLayer[] = []): LayerTable {
  const table: LayerTable = { [DEFAULT_LAYER_NAME]: makeLayer(DEFAULT_LAYER_NAME) };
  for (const layer of layers) table[layer.name] = layer;
  return table;
}

/** Asegura que exista una capa con ese nombre; la crea si falta. */
export function ensureLayer(
  table: LayerTable,
  name: string,
  overrides?: Partial<Omit<CadLayer, "name">>,
): LayerTable {
  if (table[name]) return table;
  return { ...table, [name]: makeLayer(name, overrides) };
}

/** Aplica un cambio de estado a una capa (no muta el original). */
export function setLayerState(
  table: LayerTable,
  name: string,
  patch: Partial<Omit<CadLayer, "name">>,
): LayerTable {
  const current = table[name];
  if (!current) return table;
  return { ...table, [name]: { ...current, ...patch } };
}

/**
 * Elimina una capa. La capa "0" no puede eliminarse (siempre presente en DXF).
 * Devuelve la tabla sin cambios si el nombre es "0" o no existe.
 */
export function deleteLayer(table: LayerTable, name: string): LayerTable {
  if (name === DEFAULT_LAYER_NAME || !table[name]) return table;
  const next = { ...table };
  delete next[name];
  return next;
}

/** Nombres de las capas cuyas entidades se dibujan. */
export function visibleLayerNames(table: LayerTable): string[] {
  return Object.values(table)
    .filter(layerVisible)
    .map((layer) => layer.name)
    .sort();
}

/** Filtra entidades (con propiedad `.layer`) dejando sólo las de capas visibles. */
export function filterVisibleEntities<T extends { layer: string }>(
  entities: T[],
  table: LayerTable,
): T[] {
  return entities.filter((entity) => {
    const layer = table[entity.layer];
    return layer ? layerVisible(layer) : true;
  });
}
