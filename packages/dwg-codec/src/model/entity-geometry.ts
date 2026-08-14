/**
 * Modelo geométrico neutral de las entidades reales — fases D2/D3.
 *
 * Estas interfaces describen la GEOMETRÍA que el laboratorio sabe decodificar
 * de un cuerpo R2000, en unidades del dibujo y sin ninguna atadura al formato:
 * ni banderas de bits, ni deltas DD, ni atajos BT/BE. La forma en que esa
 * geometría viaja por el archivo es asunto de `src/objects/` y de
 * `src/writer/`; este modelo sólo dice QUÉ es una línea, un punto, un
 * círculo, un arco, una polilínea ligera o un texto.
 *
 * En la polilínea y el texto los campos OPCIONALES del formato se modelan con
 * `| undefined` explícito (no con propiedades ausentes): «no viajó en el
 * archivo» es información distinta de «viajó con su valor por defecto», y el
 * round-trip exacto exige conservarla. El decodificador siempre asigna todas
 * las claves, de modo que dos modelos se comparan campo a campo sin
 * ambigüedad.
 *
 * No es otro documento canónico del producto: es la representación neutral
 * que exige AGENTS.md para el codec, y no toca `CadDocument` ni el provider
 * (productionAvailable sigue false). Implementación first-party original.
 */

/** Un punto o vector 3D en unidades del dibujo. */
export interface DwgPoint3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Un punto 2D sobre el plano de la entidad (elevación aparte, si la hay). */
export interface DwgPoint2 {
  readonly x: number;
  readonly y: number;
}

/** Anchos inicial y final de un segmento de polilínea ligera. */
export interface DwgVertexWidths {
  readonly start: number;
  readonly end: number;
}

/**
 * Segmento de recta entre dos puntos 3D. `thickness` es el grosor de
 * extrusión del formato (0 = plano) y `extrusion` la normal del plano de la
 * entidad — (0,0,1) en el caso canónico, pero el modelo no lo impone.
 */
export interface DwgLineEntity {
  readonly kind: "line";
  readonly start: DwgPoint3;
  readonly end: DwgPoint3;
  readonly thickness: number;
  readonly extrusion: DwgPoint3;
}

/**
 * Punto aislado. `xAxisAngle` es el ángulo (en radianes) del eje X local que
 * el formato guarda para orientar la marca del punto.
 */
export interface DwgPointEntity {
  readonly kind: "point";
  readonly position: DwgPoint3;
  readonly thickness: number;
  readonly extrusion: DwgPoint3;
  readonly xAxisAngle: number;
}

/** Círculo completo: centro y radio sobre el plano definido por la extrusión. */
export interface DwgCircleEntity {
  readonly kind: "circle";
  readonly center: DwgPoint3;
  readonly radius: number;
  readonly thickness: number;
  readonly extrusion: DwgPoint3;
}

/**
 * Arco de círculo: como el círculo, más los ángulos inicial y final en
 * radianes medidos sobre el plano de la entidad.
 */
export interface DwgArcEntity {
  readonly kind: "arc";
  readonly center: DwgPoint3;
  readonly radius: number;
  readonly thickness: number;
  readonly extrusion: DwgPoint3;
  readonly startAngle: number;
  readonly endAngle: number;
}

/**
 * Polilínea ligera (LWPOLYLINE): vértices 2D con bulges opcionales por
 * vértice (curvatura del segmento que ARRANCA en él; 0 = recto), anchos
 * opcionales por vértice y bandera de cierre. `undefined` en un campo
 * opcional significa que el archivo NO lo llevó; los arrays de bulges y
 * anchos, cuando existen, tienen exactamente un elemento por vértice.
 */
export interface DwgLwPolylineEntity {
  readonly kind: "lwpolyline";
  readonly closed: boolean;
  readonly vertices: readonly DwgPoint2[];
  readonly bulges: readonly number[] | undefined;
  readonly widths: readonly DwgVertexWidths[] | undefined;
  readonly constantWidth: number | undefined;
  readonly elevation: number | undefined;
  readonly thickness: number | undefined;
  readonly extrusion: DwgPoint3 | undefined;
}

/**
 * Texto de una línea (TEXT). La cadena viaja como BYTES en la página de
 * códigos del dibujo — decidir una decodificación de texto aquí fingiría una
 * fidelidad que esta capa no puede prometer (mismo contrato que `readTV`).
 * Los campos que el formato marca como ausentes llegan `undefined`; los
 * códigos de generación y alineación se conservan crudos porque su semántica
 * es de una capa superior.
 */
export interface DwgTextEntity {
  readonly kind: "text";
  readonly insertion: DwgPoint2;
  readonly elevation: number | undefined;
  readonly alignment: DwgPoint2 | undefined;
  readonly thickness: number;
  readonly extrusion: DwgPoint3;
  readonly obliqueAngle: number | undefined;
  readonly rotation: number | undefined;
  readonly height: number;
  readonly widthFactor: number | undefined;
  readonly valueBytes: readonly number[];
  readonly generation: number | undefined;
  readonly horizontalAlignment: number | undefined;
  readonly verticalAlignment: number | undefined;
}

/**
 * Referencia a bloque (INSERT). La geometría propia es la colocación: punto
 * de inserción, escalas por eje, rotación y extrusión. QUÉ bloque se inserta
 * no vive aquí — es una referencia entre objetos, y el modelo neutral no
 * transporta handles del formato: el decodificador la expone aparte y el
 * lector de base de datos la resuelve a un nombre de bloque.
 * `attributesFollow` conserva la bandera de ATTRIBs del formato; decodificar
 * esos ATTRIBs queda declarado pendiente (fase D4).
 */
export interface DwgInsertEntity {
  readonly kind: "insert";
  readonly position: DwgPoint3;
  /** Escalas por eje. El caso unitario (1,1,1) es el habitual. */
  readonly scale: DwgPoint3;
  readonly rotation: number;
  readonly extrusion: DwgPoint3;
  /** Bandera del formato: a 1, entidades ATTRIB siguen al INSERT. */
  readonly attributesFollow: boolean;
}

/** Las entidades geométricas que las fases D2/D3/D4 decodifican y codifican. */
export type DwgGeometryEntity =
  | DwgLineEntity
  | DwgPointEntity
  | DwgCircleEntity
  | DwgArcEntity
  | DwgLwPolylineEntity
  | DwgTextEntity
  | DwgInsertEntity;

/** Los discriminantes válidos del modelo, para validación cerrada. */
export const DWG_GEOMETRY_ENTITY_KINDS = Object.freeze([
  "line",
  "point",
  "circle",
  "arc",
  "lwpolyline",
  "text",
  "insert",
] as const);

export type DwgGeometryEntityKind = (typeof DWG_GEOMETRY_ENTITY_KINDS)[number];

/** ¿Los tres componentes son números finitos? (NaN/±Infinity no son geometría.) */
export function isFiniteDwgPoint3(value: DwgPoint3): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

/** ¿Ambos componentes 2D son números finitos? */
export function isFiniteDwgPoint2(value: DwgPoint2): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y);
}
