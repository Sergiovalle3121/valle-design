/**
 * Modelo del gestor de propiedades de capa (LAYER).
 *
 * El gestor que había en el monolito sabía crear, renombrar, recolorear,
 * ocultar, bloquear y borrar. Un plano de verdad necesita además tipo de línea,
 * grosor, plot on/off, CONGELAR —global y por viewport— y filtros para no
 * perderse entre ochenta capas.
 *
 * Este módulo es la parte pura: las filas y su filtrado. Sin React y sin
 * documento — entra una lista de filas, sale otra lista.
 *
 * ## Lo que este gestor NO hace, y por qué
 *
 * **Transparencia de capa.** AutoCAD la tiene; `CadLayerDef` no. Un control
 * que no persiste sería peor que ninguno: el usuario pondría una capa al 50 %,
 * guardaría, recargaría y la vería opaca sin que nada avisara. Cuando
 * `CadLayerDef` gane `transparency?: number` (0–90, como DXF 1440), este
 * modelo la trata igual que `lineweight` y la fila ya está preparada.
 *
 * ## Lo que DEJÓ de hacer
 *
 * La captura y restauración de estados de capa vivía aquí cuando los estados
 * eran de la sesión. Desde el esquema 9 viven en `document.layerStates` y la
 * maquinaria canónica está en `lib/cad/layer-states.ts` — la de aquí era una
 * copia sobre filas de interfaz y mantener dos era exactamente cómo divergen.
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
   * Congelada A NIVEL DE DOCUMENTO (esquema 9): ni se dibuja, ni se regenera,
   * ni cuenta para extensión ni selección. Distinta de `visible`, que sólo
   * esconde, y de `frozenInViewport`, que congela en UNA ventana.
   */
  frozen: boolean;
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
  | "frozen"
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
  frozen: "Congeladas",
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
    case "frozen":
      return row.frozen;
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

/** Un estado de capa, tal como lo enseña la paleta: sólo su identidad. */
export interface CadLayerStateListing {
  name: string;
}
