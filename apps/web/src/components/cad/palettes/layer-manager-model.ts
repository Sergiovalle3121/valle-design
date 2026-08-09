/**
 * Modelo del gestor de propiedades de capa (LAYER).
 *
 * El gestor que había en el monolito sabía crear, renombrar, recolorear,
 * ocultar, bloquear y borrar. Un plano de verdad necesita además tipo de línea,
 * grosor, plot on/off, congelación POR VIEWPORT y filtros para no perderse
 * entre ochenta capas. Y necesita estados de capa: guardar «cómo se ve esto
 * para imprimir estructura» y volver a él sin tocar ochenta interruptores.
 *
 * Este módulo es la parte pura: filtrado, captura y restauración de estados.
 * Sin React y sin documento — entra una lista de filas, sale otra lista o un
 * conjunto de parches.
 *
 * ## Lo que este gestor NO hace, y por qué
 *
 * **Transparencia de capa.** AutoCAD la tiene; `CadLayerDef` no. Añadir el
 * campo es tocar `lib/cad/cad-document.ts`, que en esta ola pertenece a otra
 * sesión, y un control que no persiste sería peor que ninguno: el usuario
 * pondría una capa al 50 %, guardaría, recargaría y la vería opaca sin que
 * nada avisara. Cuando `CadLayerDef` gane `transparency?: number` (0–90, como
 * DXF 1440), este modelo la trata igual que `lineweight` y la fila ya está
 * preparada para ello.
 *
 * **Persistencia de los estados de capa.** Se guardan en la sesión, no en el
 * documento, por la misma razón: `CadDocument` no tiene dónde ponerlos.
 * Restaurar uno SÍ toca el documento —emite parches por la ruta canónica— así
 * que el efecto es real y reversible con deshacer; lo que no sobrevive es la
 * lista de estados tras recargar. Está dicho en la interfaz, no sólo aquí.
 */

export interface CadLayerManagerRow {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  linetype: string;
  /** Grosor en mm; -1 es «por defecto», como en DXF. */
  lineweight: number;
  plot: boolean;
  /** Objetos del documento en esta capa. */
  objectCount: number;
  /**
   * Congelada en el viewport activo. `null` cuando no hay ninguno —en espacio
   * modelo—, que NO es lo mismo que «descongelada»: la columna se apaga en vez
   * de mentir con un interruptor que no iría a ninguna parte.
   */
  frozenInViewport: boolean | null;
  /** Capa activa: la que reciben los objetos nuevos. */
  active: boolean;
}

export type CadLayerFilterProperty =
  | "all"
  | "visible"
  | "hidden"
  | "locked"
  | "unlocked"
  | "plot"
  | "noplot"
  | "used"
  | "empty"
  | "viewport-frozen";

export interface CadLayerFilter {
  /** Filtro por nombre. Sin distinguir mayúsculas; subcadena, no prefijo. */
  text: string;
  property: CadLayerFilterProperty;
}

export const EMPTY_CAD_LAYER_FILTER: CadLayerFilter = {
  text: "",
  property: "all",
};

export const CAD_LAYER_FILTER_LABELS: Record<CadLayerFilterProperty, string> = {
  all: "Todas",
  visible: "Visibles",
  hidden: "Ocultas",
  locked: "Bloqueadas",
  unlocked: "Desbloqueadas",
  plot: "Se imprimen",
  noplot: "No se imprimen",
  used: "Con objetos",
  empty: "Vacías",
  "viewport-frozen": "Congeladas en el viewport",
};

/** Tipos de línea que el motor sabe aplicar (`lib/cad/linetype.ts`). */
export const CAD_LINETYPE_NAMES = [
  "CONTINUOUS",
  "DASHED",
  "HIDDEN",
  "CENTER",
  "DASHDOT",
  "DOTTED",
] as const;

/** Grosores normalizados en mm. -1 es «por defecto», igual que en DXF. */
export const CAD_LINEWEIGHTS = [
  -1, 0.05, 0.09, 0.13, 0.15, 0.18, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.53, 0.6,
  0.7, 0.8, 0.9, 1, 1.06, 1.2, 1.4, 1.58, 2, 2.11,
] as const;

export function describeCadLineweight(value: number): string {
  return value < 0 ? "Por defecto" : `${value.toFixed(2)} mm`;
}

function matchesProperty(
  row: CadLayerManagerRow,
  property: CadLayerFilterProperty,
): boolean {
  switch (property) {
    case "visible":
      return row.visible;
    case "hidden":
      return !row.visible;
    case "locked":
      return row.locked;
    case "unlocked":
      return !row.locked;
    case "plot":
      return row.plot;
    case "noplot":
      return !row.plot;
    case "used":
      return row.objectCount > 0;
    case "empty":
      return row.objectCount === 0;
    case "viewport-frozen":
      return row.frozenInViewport === true;
    default:
      return true;
  }
}

/**
 * Aplica los dos filtros a la vez, que es como funcionan en AutoCAD: el de
 * nombre y el de propiedad se ACUMULAN, no se excluyen.
 */
export function filterCadLayerRows(
  rows: readonly CadLayerManagerRow[],
  filter: CadLayerFilter,
): CadLayerManagerRow[] {
  const needle = filter.text.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    if (needle && !row.name.toLocaleLowerCase().includes(needle)) return false;
    return matchesProperty(row, filter.property);
  });
}

/** Lo que un estado de capa recuerda de cada capa. */
export interface CadLayerStateEntry {
  visible: boolean;
  locked: boolean;
  color: string;
  linetype: string;
  lineweight: number;
  plot: boolean;
}

export interface CadLayerState {
  name: string;
  entries: Record<string, CadLayerStateEntry>;
}

/**
 * Fotografía el reparto actual. Toma TODAS las filas, no las filtradas: un
 * estado que sólo recordara lo que se veía en pantalla al guardarlo sería una
 * trampa —restaurarlo dejaría el resto del dibujo como estuviese— y nadie
 * podría saberlo mirando su nombre.
 */
export function captureCadLayerState(
  name: string,
  rows: readonly CadLayerManagerRow[],
): CadLayerState {
  const entries: Record<string, CadLayerStateEntry> = {};
  for (const row of rows)
    entries[row.id] = {
      visible: row.visible,
      locked: row.locked,
      color: row.color,
      linetype: row.linetype,
      lineweight: row.lineweight,
      plot: row.plot,
    };
  return { name: name.trim(), entries };
}

export interface CadLayerStatePatch {
  id: string;
  patch: Partial<CadLayerStateEntry>;
}

export interface CadLayerStateRestorePlan {
  patches: CadLayerStatePatch[];
  /** Capas del estado que ya no existen. */
  missing: string[];
  /** Capas creadas DESPUÉS de guardar el estado; se dejan como están. */
  unknown: string[];
}

/**
 * Calcula qué hay que cambiar para volver a un estado.
 *
 * Sólo devuelve lo que DIFIERE. Restaurar el estado en el que ya se está no
 * emite ningún parche, y por tanto no ensucia el documento ni añade un paso de
 * deshacer que no revierte nada. Las capas nacidas después del estado se
 * dejan intactas y se informan: borrarlas o esconderlas sería inventarse una
 * intención que el estado no contiene.
 */
export function planCadLayerStateRestore(
  state: CadLayerState,
  rows: readonly CadLayerManagerRow[],
): CadLayerStateRestorePlan {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const patches: CadLayerStatePatch[] = [];
  const missing: string[] = [];

  for (const [id, entry] of Object.entries(state.entries)) {
    const row = byId.get(id);
    if (!row) {
      missing.push(id);
      continue;
    }
    const patch: Partial<CadLayerStateEntry> = {};
    if (row.visible !== entry.visible) patch.visible = entry.visible;
    if (row.locked !== entry.locked) patch.locked = entry.locked;
    if (row.color !== entry.color) patch.color = entry.color;
    if (row.linetype !== entry.linetype) patch.linetype = entry.linetype;
    if (row.lineweight !== entry.lineweight)
      patch.lineweight = entry.lineweight;
    if (row.plot !== entry.plot) patch.plot = entry.plot;
    if (Object.keys(patch).length > 0) patches.push({ id, patch });
  }

  const unknown = rows
    .filter((row) => !(row.id in state.entries))
    .map((row) => row.id);

  return { patches, missing, unknown };
}
