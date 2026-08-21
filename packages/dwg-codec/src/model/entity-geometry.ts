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
 * Campos compartidos por TEXT y por los atributos ATTRIB/ATTDEF, cuya
 * disposición en el formato es la misma (hecho registrado). La cadena viaja
 * como BYTES en la página de códigos del dibujo — decidir una decodificación
 * de texto aquí fingiría una fidelidad que esta capa no puede prometer
 * (mismo contrato que `readTV`). Los campos que el formato marca como
 * ausentes llegan `undefined`; los códigos de generación y alineación se
 * conservan crudos porque su semántica es de una capa superior.
 */
export interface DwgTextFields {
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

/** Texto de una línea (TEXT). */
export interface DwgTextEntity extends DwgTextFields {
  readonly kind: "text";
}

/**
 * Atributo con valor dentro de un INSERT (ATTRIB): los campos de TEXT más el
 * tag, la longitud de campo y las banderas crudas del atributo.
 */
export interface DwgAttribEntity extends DwgTextFields {
  readonly kind: "attrib";
  readonly tagBytes: readonly number[];
  readonly fieldLength: number;
  readonly attributeFlags: number;
}

/** Definición de atributo dentro de un bloque (ATTDEF): ATTRIB más el prompt. */
export interface DwgAttdefEntity extends DwgTextFields {
  readonly kind: "attdef";
  readonly tagBytes: readonly number[];
  readonly fieldLength: number;
  readonly attributeFlags: number;
  readonly promptBytes: readonly number[];
}

/**
 * Fin de secuencia (SEQEND): cierra los ATTRIB de un INSERT o los VERTEX de
 * una POLYLINE clásica. No lleva campos propios (hecho registrado); es un
 * marcador estructural con handle, no geometría.
 */
export interface DwgSeqendEntity {
  readonly kind: "seqend";
}

/**
 * Texto multilínea (MTEXT). Los códigos de attachment, dirección de dibujo y
 * estilo de interlineado se conservan CRUDOS (BS del formato); el bit final
 * R2000 sin semántica registrada viaja crudo como `trailingBit`.
 */
export interface DwgMTextEntity {
  readonly kind: "mtext";
  readonly insertion: DwgPoint3;
  readonly extrusion: DwgPoint3;
  readonly xAxisDirection: DwgPoint3;
  readonly rectWidth: number;
  readonly height: number;
  readonly attachment: number;
  readonly drawingDirection: number;
  readonly extentsHeight: number;
  readonly extentsWidth: number;
  readonly valueBytes: readonly number[];
  readonly lineSpacingStyle: number;
  readonly lineSpacingFactor: number;
  readonly trailingBit: number;
}

/** Las siete variantes de cota del formato R2000. */
export type DwgDimensionKind =
  | "ordinate"
  | "linear"
  | "aligned"
  | "angular3pt"
  | "angular2ln"
  | "radius"
  | "diameter";

/**
 * Cota (familia DIMENSION). Los datos comunes viajan en todas las variantes;
 * los puntos y campos que sólo algunas llevan llegan `undefined` en las
 * demás. Los puntos usan los nombres de grupo del dibujo (10/13/14/15/16)
 * porque su papel geométrico depende de la variante; las banderas RC viajan
 * crudas. El texto de usuario llega como bytes (página de códigos aparte).
 */
export interface DwgDimensionEntity {
  readonly kind: "dimension";
  readonly dimensionKind: DwgDimensionKind;
  readonly extrusion: DwgPoint3;
  readonly textMidpoint: DwgPoint2;
  readonly elevation: number;
  readonly flags: number;
  readonly userTextBytes: readonly number[];
  readonly textRotation: number;
  readonly horizontalDirection: number;
  readonly insertScale: DwgPoint3;
  readonly insertRotation: number;
  readonly attachment: number;
  readonly lineSpacingStyle: number;
  readonly lineSpacingFactor: number;
  readonly actualMeasurement: number;
  readonly clonePoint: DwgPoint2;
  readonly definitionPoint: DwgPoint3;
  readonly point13: DwgPoint3 | undefined;
  readonly point14: DwgPoint3 | undefined;
  readonly point15: DwgPoint3 | undefined;
  readonly point16: DwgPoint2 | undefined;
  readonly extensionLineRotation: number | undefined;
  readonly dimensionRotation: number | undefined;
  readonly leaderLength: number | undefined;
  readonly ordinateFlags: number | undefined;
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

/**
 * Cabecera de la POLYLINE 2D clásica. Sus vértices viajan como entidades
 * VERTEX aparte (el lector de base los ata por el propietario); las banderas
 * BS conservan la semántica del grupo 70 del dibujo y viajan CRUDAS.
 */
export interface DwgPolyline2dEntity {
  readonly kind: "polyline2d";
  readonly flags: number;
  readonly curveType: number;
  readonly startWidth: number;
  readonly endWidth: number;
  readonly thickness: number;
  readonly elevation: number;
  readonly extrusion: DwgPoint3;
}

/** Cabecera de la POLYLINE 3D: dos bytes de banderas crudas (spline/cierre). */
export interface DwgPolyline3dEntity {
  readonly kind: "polyline3d";
  readonly splineFlags: number;
  readonly closedFlags: number;
}

/** Cabecera de la malla M×N (POLYLINE MESH). */
export interface DwgPolylineMeshEntity {
  readonly kind: "polymesh";
  readonly flags: number;
  readonly curveType: number;
  readonly mVertexCount: number;
  readonly nVertexCount: number;
  readonly mDensity: number;
  readonly nDensity: number;
}

/** Cabecera de la malla de caras (POLYLINE PFACE). */
export interface DwgPolyfaceMeshEntity {
  readonly kind: "polyfaceMesh";
  readonly vertexCount: number;
  readonly faceCount: number;
}

/** VERTEX 2D de una polilínea clásica; banderas RC crudas. */
export interface DwgVertex2dEntity {
  readonly kind: "vertex2d";
  readonly flags: number;
  readonly position: DwgPoint3;
  readonly startWidth: number;
  readonly endWidth: number;
  readonly bulge: number;
  readonly tangentDirection: number;
}

/** VERTEX 3D, de malla o de polyface: banderas RC crudas y posición. */
export interface DwgVertex3dEntity {
  readonly kind: "vertex3d";
  readonly flags: number;
  readonly position: DwgPoint3;
}

export interface DwgVertexMeshEntity {
  readonly kind: "vertexMesh";
  readonly flags: number;
  readonly position: DwgPoint3;
}

export interface DwgVertexPfaceEntity {
  readonly kind: "vertexPface";
  readonly flags: number;
  readonly position: DwgPoint3;
}

/**
 * Cara de una malla polyface: cuatro índices BS sobre los vértices de su
 * polilínea (negativo = arista invisible, 0 = sin cuarto vértice; se
 * conservan CRUDOS).
 */
export interface DwgPfaceFaceEntity {
  readonly kind: "pfaceFace";
  readonly index1: number;
  readonly index2: number;
  readonly index3: number;
  readonly index4: number;
}

/**
 * Elipse: centro, extremo del eje mayor como VECTOR relativo al centro,
 * extrusión (3BD completa, no BE), razón de ejes y ángulos paramétricos.
 */
export interface DwgEllipseEntity {
  readonly kind: "ellipse";
  readonly center: DwgPoint3;
  readonly majorAxisEndpoint: DwgPoint3;
  readonly extrusion: DwgPoint3;
  readonly axisRatio: number;
  readonly startAngle: number;
  readonly endAngle: number;
}

/**
 * Spline. El formato guarda dos escenarios excluyentes (hecho registrado):
 * 1 = nudos + puntos de control (con pesos opcionales), 2 = puntos de
 * ajuste con tangentes. Los campos del escenario ausente llegan `undefined`.
 */
export interface DwgSplineEntity {
  readonly kind: "spline";
  readonly scenario: number;
  readonly degree: number;
  readonly rational: boolean | undefined;
  readonly closed: boolean | undefined;
  readonly periodic: boolean | undefined;
  readonly knotTolerance: number | undefined;
  readonly controlTolerance: number | undefined;
  readonly knots: readonly number[] | undefined;
  readonly controlPoints: readonly DwgPoint3[] | undefined;
  readonly weights: readonly number[] | undefined;
  readonly fitTolerance: number | undefined;
  readonly startTangent: DwgPoint3 | undefined;
  readonly endTangent: DwgPoint3 | undefined;
  readonly fitPoints: readonly DwgPoint3[] | undefined;
}

/** Semirrecta (RAY) o recta infinita (XLINE): punto base y vector unitario. */
export interface DwgRayEntity {
  readonly kind: "ray";
  readonly basePoint: DwgPoint3;
  readonly direction: DwgPoint3;
}

export interface DwgXlineEntity {
  readonly kind: "xline";
  readonly basePoint: DwgPoint3;
  readonly direction: DwgPoint3;
}

/** SOLID o TRACE: cuatro esquinas 2D sobre una elevación común. */
export interface DwgSolidEntity {
  readonly kind: "solid";
  readonly thickness: number;
  readonly elevation: number;
  readonly corners: readonly [DwgPoint2, DwgPoint2, DwgPoint2, DwgPoint2];
  readonly extrusion: DwgPoint3;
}

export interface DwgTraceEntity {
  readonly kind: "trace";
  readonly thickness: number;
  readonly elevation: number;
  readonly corners: readonly [DwgPoint2, DwgPoint2, DwgPoint2, DwgPoint2];
  readonly extrusion: DwgPoint3;
}

/** Cara 3D: cuatro esquinas y banderas de invisibilidad de aristas crudas. */
export interface Dwg3dFaceEntity {
  readonly kind: "face3d";
  readonly corners: readonly [DwgPoint3, DwgPoint3, DwgPoint3, DwgPoint3];
  readonly invisibilityFlags: number;
}

/** Las entidades geométricas que el laboratorio decodifica. */
export type DwgGeometryEntity =
  | DwgLineEntity
  | DwgPointEntity
  | DwgCircleEntity
  | DwgArcEntity
  | DwgLwPolylineEntity
  | DwgTextEntity
  | DwgInsertEntity
  | DwgAttribEntity
  | DwgAttdefEntity
  | DwgSeqendEntity
  | DwgMTextEntity
  | DwgDimensionEntity
  | DwgPolyline2dEntity
  | DwgPolyline3dEntity
  | DwgPolylineMeshEntity
  | DwgPolyfaceMeshEntity
  | DwgVertex2dEntity
  | DwgVertex3dEntity
  | DwgVertexMeshEntity
  | DwgVertexPfaceEntity
  | DwgPfaceFaceEntity
  | DwgEllipseEntity
  | DwgSplineEntity
  | DwgRayEntity
  | DwgXlineEntity
  | DwgSolidEntity
  | DwgTraceEntity
  | Dwg3dFaceEntity;

/** Los discriminantes válidos del modelo, para validación cerrada. */
export const DWG_GEOMETRY_ENTITY_KINDS = Object.freeze([
  "line",
  "point",
  "circle",
  "arc",
  "lwpolyline",
  "text",
  "insert",
  "attrib",
  "attdef",
  "seqend",
  "mtext",
  "dimension",
  "polyline2d",
  "polyline3d",
  "polymesh",
  "polyfaceMesh",
  "vertex2d",
  "vertex3d",
  "vertexMesh",
  "vertexPface",
  "pfaceFace",
  "ellipse",
  "spline",
  "ray",
  "xline",
  "solid",
  "trace",
  "face3d",
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
