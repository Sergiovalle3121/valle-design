/**
 * Modelo geométrico neutral de las primeras entidades reales — fase D2.
 *
 * Estas interfaces describen la GEOMETRÍA que el laboratorio sabe decodificar
 * de un cuerpo R2000, en unidades del dibujo y sin ninguna atadura al formato:
 * ni banderas de bits, ni deltas DD, ni atajos BT/BE. La forma en que esa
 * geometría viaja por el archivo es asunto de `src/objects/` y de
 * `src/writer/`; este modelo sólo dice QUÉ es una línea, un punto, un círculo
 * o un arco.
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

/** Las entidades geométricas que la fase D2 sabe decodificar y codificar. */
export type DwgGeometryEntity =
  | DwgLineEntity
  | DwgPointEntity
  | DwgCircleEntity
  | DwgArcEntity;

/** Los discriminantes válidos del modelo, para validación cerrada. */
export const DWG_GEOMETRY_ENTITY_KINDS = Object.freeze([
  "line",
  "point",
  "circle",
  "arc",
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
